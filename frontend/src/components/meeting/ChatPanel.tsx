import React, { useState, useRef, useEffect } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';
import supabase from '../../services/supabase';
import { Send, Smile } from 'lucide-react';
import { Input, Button } from '../ui';

interface ChatPanelProps {
  roomId: string;
  userId: string;
  username: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ roomId, userId, username }) => {
  const { chatMessages } = useMeetingStore();
  const [text, setText] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const messageText = text.trim();
    if (!messageText) return;

    // Save message to Supabase database for persistence
    try {
      const { data: meeting } = await supabase
        .from('meetings')
        .select('id')
        .eq('code', roomId)
        .maybeSingle();

      if (meeting) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const cleanUserId = uuidRegex.test(userId) ? userId : null;

        await supabase.from('chat_messages').insert({
          meeting_id: meeting.id,
          user_id: cleanUserId,
          sender_name: username,
          message: messageText
        });
      }
    } catch (err) {
      console.error('Failed to persist chat message in database:', err);
    }

    // Send chat via signaling client
    const provider = import.meta.env.VITE_SIGNALING_PROVIDER || 'supabase';

    if (provider === 'socketio') {
      // Socket.IO requires explicit room parameters
      // @ts-ignore
      signalingClient.sendChatWithDetails(roomId, username, messageText, userId);
    } else {
      signalingClient.sendChat(messageText);
    }

    setText('');
  };

  const sendEmoji = async (emoji: string) => {
    // Save emoji message to Supabase database for persistence
    try {
      const { data: meeting } = await supabase
        .from('meetings')
        .select('id')
        .eq('code', roomId)
        .maybeSingle();

      if (meeting) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const cleanUserId = uuidRegex.test(userId) ? userId : null;

        await supabase.from('chat_messages').insert({
          meeting_id: meeting.id,
          user_id: cleanUserId,
          sender_name: username,
          message: emoji
        });
      }
    } catch (err) {
      console.error('Failed to persist emoji message in database:', err);
    }

    const provider = import.meta.env.VITE_SIGNALING_PROVIDER || 'supabase';
    if (provider === 'socketio') {
      // @ts-ignore
      signalingClient.sendChatWithDetails(roomId, username, emoji, userId);
    } else {
      signalingClient.sendChat(emoji);
    }
  };

  const quickEmojis = ['👍', '❤️', '😂', '🎉', '😮', '😢', '👏', '🔥'];

  return (
    <div className="w-full h-full flex flex-col bg-surface-dark border-l border-white/5 z-20">
      
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5 flex items-center">
        <h3 className="font-bold text-xs text-on-dark uppercase tracking-wider">
          Meeting Chat
        </h3>
      </div>

      {/* Messages List */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4">
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-xs text-on-dark-soft font-semibold p-4">
            <Smile className="w-8 h-8 mb-2 opacity-50 text-primary" />
            No messages yet. Send a message to get started!
          </div>
        ) : (
          chatMessages.map((msg) => {
            const isMe = msg.userId === userId || msg.senderId === signalingClient.getSocketId();
            
            return (
              <div 
                key={msg.id} 
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center space-x-1.5 mb-1 text-[10px] font-semibold text-on-dark-soft">
                  <span className="truncate max-w-[120px]">{msg.username}</span>
                  <span>•</span>
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className={`px-3.5 py-2 text-xs rounded-2xl max-w-[85%] break-words border shadow-sm ${
                  isMe 
                    ? 'bg-primary border-primary text-white rounded-tr-none' 
                    : 'bg-surface-dark-soft border-white/5 text-on-dark rounded-tl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Emojis Selection Bar */}
      <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between bg-surface-dark-soft/50">
        {quickEmojis.map(emoji => (
          <button
            key={emoji}
            onClick={() => sendEmoji(emoji)}
            className="hover:scale-125 transition-transform p-1 text-sm filter drop-shadow-sm focus:outline-none"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-4 border-t border-white/5 flex items-center gap-2 bg-surface-dark-elevated">
        <Input
          placeholder="Send message to everyone..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="bg-surface-dark border-white/5 text-on-dark placeholder-on-dark-soft focus:ring-primary"
        />
        <Button 
          type="submit" 
          disabled={!text.trim()} 
          size="sm"
          className="flex-shrink-0 h-10 rounded-md"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
};
export default ChatPanel;
