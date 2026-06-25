import React, { useState, useRef, useEffect } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';

import { Send } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';

interface ChatPanelProps {
  roomId: string;
  userId: string;
  username: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ roomId, userId, username }) => {
  const { chatMessages } = useMeetingStore();
  const [text, setText] = useState('');
  const { getToken } = useAuth();
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:5001';
      let token = null;
      try { token = await getToken(); } catch(e){}

      await fetch(`${backendUrl}/api/meetings/${roomId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ message: messageText, senderName: username })
      });
    } catch (err) {
      console.error('Failed to persist chat message in database:', err);
    }

    const provider = import.meta.env.VITE_SIGNALING_PROVIDER || 'supabase';
    if (provider === 'socketio') {
      // @ts-ignore
      signalingClient.sendChatWithDetails(roomId, username, messageText, userId);
    } else {
      signalingClient.sendChat(messageText);
    }
    setText('');
  };

  const quickEmojis = ['👍', '❤️', '😂', '🎉', '😮', '👏', '🔥'];

  return (
    <div className="w-full h-full flex flex-col z-20">
      
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-[#e8eaed]">
          In-call messages
        </h3>
      </div>

      {/* Messages */}
      <div className="flex-grow overflow-y-auto px-4 py-3 space-y-3">
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <p className="text-xs text-[#9aa0a6]">
              Messages can only be seen by people in the call and are deleted when the call ends.
            </p>
          </div>
        ) : (
          chatMessages.map((msg) => {
            const isMe = msg.userId === userId || msg.senderId === signalingClient.getSocketId();
            
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-1.5 mb-1 text-[10px] text-[#9aa0a6]">
                  <span className="font-medium">{msg.username}</span>
                  <span>·</span>
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className={`px-3 py-2 text-[13px] rounded-2xl max-w-[85%] break-words ${
                  isMe 
                    ? 'bg-[#8ab4f8] text-[#202124] rounded-tr-sm' 
                    : 'bg-[#3c4043] text-[#e8eaed] rounded-tl-sm'
                }`}>
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Emojis */}
      <div className="px-4 py-1.5 border-t border-white/[0.06] flex items-center gap-1">
        {quickEmojis.map(emoji => (
          <button
            key={emoji}
            onClick={async () => {
              try {
                const backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:5001';
                let token = null;
                try { token = await getToken(); } catch(e){}
                await fetch(`${backendUrl}/api/meetings/${roomId}/chat`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                  body: JSON.stringify({ message: emoji, senderName: username })
                });
              } catch {}
              const provider = import.meta.env.VITE_SIGNALING_PROVIDER || 'supabase';
              if (provider === 'socketio') { // @ts-ignore
                signalingClient.sendChatWithDetails(roomId, username, emoji, userId); }
              else { signalingClient.sendChat(emoji); }
            }}
            className="hover:scale-110 transition-transform p-1.5 text-sm rounded-full hover:bg-white/10 cursor-pointer"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 border-t border-white/[0.06] flex items-center gap-2">
        <input
          placeholder="Send a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 bg-[#3c4043] text-[#e8eaed] placeholder-[#9aa0a6] rounded-full px-4 py-2.5 text-[13px] border-none outline-none focus:ring-1 focus:ring-[#8ab4f8]/50"
        />
        <button 
          type="submit" 
          disabled={!text.trim()} 
          className="w-9 h-9 rounded-full bg-[#8ab4f8] hover:bg-[#aecbfa] disabled:bg-[#3c4043] disabled:text-[#5f6368] text-[#202124] flex items-center justify-center transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
export default ChatPanel;
