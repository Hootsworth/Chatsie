-- Database Schema for Video Conferencing Platform (Zoom/Meet Clone)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROFILES TABLE
-- Store public user info, linked to Supabase Auth users
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    username text unique not null,
    full_name text,
    avatar_url text,
    updated_at timestamp with time zone default now()
);

-- Enable RLS for profiles
alter table public.profiles enable row level security;

-- RLS Policies for Profiles
create policy "Public profiles are viewable by everyone" 
on public.profiles for select 
using (true);

create policy "Users can update their own profile" 
on public.profiles for update 
using (auth.uid() = id);

-- Trigger to automatically create a profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1) || '_' || substr(md5(random()::text), 1, 5)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. MEETINGS TABLE
-- Store meeting sessions (scheduled, instant, or personal room)
create table public.meetings (
    id uuid default gen_random_uuid() primary key,
    code text unique not null, -- Format: "abc-defg-hij"
    title text not null,
    host_id uuid references auth.users on delete cascade not null,
    passcode text, -- Plaintext simple entry code (null means no passcode)
    is_waiting_room_enabled boolean default false not null,
    is_locked boolean default false not null,
    is_active boolean default false not null,
    scheduled_start timestamp with time zone,
    duration integer, -- in minutes
    created_at timestamp with time zone default now() not null
);

-- Enable RLS for meetings
alter table public.meetings enable row level security;

-- RLS Policies for Meetings
create policy "Meetings are viewable by anyone with the code"
on public.meetings for select
using (true);

create policy "Authenticated users can create meetings"
on public.meetings for insert
with check (auth.uid() = host_id);

create policy "Hosts can update their own meetings"
on public.meetings for update
using (auth.uid() = host_id);

create policy "Hosts can delete their own meetings"
on public.meetings for delete
using (auth.uid() = host_id);


-- 3. MEETING PARTICIPANTS TABLE
-- Tracks active and historical participant statuses (waiting, approved, connected, kicked)
create table public.meeting_participants (
    id uuid default gen_random_uuid() primary key,
    meeting_id uuid references public.meetings on delete cascade not null,
    user_id uuid references auth.users on delete set null, -- null for guests
    username text not null,
    role text not null check (role in ('host', 'participant')),
    status text not null default 'waiting' check (status in ('waiting', 'approved', 'connected', 'disconnected', 'kicked')),
    joined_at timestamp with time zone default now() not null,
    left_at timestamp with time zone
);

-- Enable RLS for meeting_participants
alter table public.meeting_participants enable row level security;

-- RLS Policies for Meeting Participants
create policy "Participants are viewable by anyone in the same meeting"
on public.meeting_participants for select
using (true);

create policy "Anyone can join/insert themselves as a participant"
on public.meeting_participants for insert
with check (true);

create policy "Users can update their own participant record"
on public.meeting_participants for update
using (
    (auth.uid() is not null and auth.uid() = user_id) or 
    exists (
        select 1 from public.meetings 
        where meetings.id = meeting_participants.meeting_id 
        and meetings.host_id = auth.uid()
    )
);


-- 4. CHAT MESSAGES TABLE
-- Persistent chat messages for meetings
create table public.chat_messages (
    id uuid default gen_random_uuid() primary key,
    meeting_id uuid references public.meetings on delete cascade not null,
    user_id uuid references auth.users on delete set null, -- null for guests
    sender_name text not null,
    message text not null,
    created_at timestamp with time zone default now() not null
);

-- Enable RLS for chat messages
alter table public.chat_messages enable row level security;

-- RLS Policies for Chat Messages
create policy "Chat messages are viewable by anyone with access to the meeting"
on public.chat_messages for select
using (true);

create policy "Anyone can insert chat messages in a meeting"
on public.chat_messages for insert
with check (true);


-- 5. Helper Views & Functions for dashboard stats
-- Get meeting details with host profile info
create or replace view public.meeting_details as
select 
    m.*,
    p.full_name as host_name,
    p.avatar_url as host_avatar_url
from public.meetings m
left join public.profiles p on m.host_id = p.id;
