import React, { useState, useRef, useEffect } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';

import { Send, Smile } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { Input, Button } from '../ui';

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

    // Save message to database for persistence
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:5001';
      let token = null;
      try {
        token = await getToken();
      } catch(e){}

      await fetch(`${backendUrl}/api/meetings/${roomId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          message: messageText,
          senderName: username
        })
      });
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
    // Save emoji message to database for persistence
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:5001';
      let token = null;
      try {
        token = await getToken();
      } catch(e){}

      await fetch(`${backendUrl}/api/meetings/${roomId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          message: emoji,
          senderName: username
        })
      });
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
    <div className="w-full h-full flex flex-col bg-transparent z-20">
      
      {/* Header */}
      <div className="px-5 py-4 border-b border-hairline flex items-center">
        <h3 className="font-bold text-xs text-ink uppercase tracking-wider">
          Meeting Chat
        </h3>
      </div>

      {/* Messages List */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4">
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-xs text-ink/70 font-semibold p-4">
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
                <div className="flex items-center space-x-1.5 mb-1 text-[10px] font-semibold text-ink/70">
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
                    : 'bg-canvas border border-hairline text-ink rounded-tl-none'
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
      <div className="px-4 py-2 border-t border-hairline flex items-center justify-between bg-block-cream">
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
      <form onSubmit={handleSend} className="p-4 border-t border-hairline flex items-center gap-2 bg-canvas text-ink">
        <Input
          placeholder="Send message to everyone..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="bg-canvas text-ink border-hairline text-ink placeholder-on-dark-soft focus:ring-primary"
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
