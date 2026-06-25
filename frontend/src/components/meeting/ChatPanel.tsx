import React, { useState, useRef, useEffect } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';
import { Send, Trash2, CheckCircle2, MessageSquare, BarChart2, HelpCircle, ThumbsUp, Check, Square } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { Button } from '../ui';

interface ChatPanelProps {
  roomId: string;
  userId: string;
  username: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ roomId, userId, username }) => {
  const { chatMessages, polls, questions, myRole } = useMeetingStore();
  const [activeTab, setActiveTab] = useState<'chat' | 'polls' | 'qa'>('chat');
  const { getToken } = useAuth();
  
  // Local state for chat input
  const [text, setText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Local state for poll creation
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [isCreatingPoll, setIsCreatingPoll] = useState(false);

  // Local state for Q&A input
  const [questionText, setQuestionText] = useState('');

  const isHost = myRole === 'host';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab === 'chat') {
      scrollToBottom();
    }
  }, [chatMessages, activeTab]);

  const handleSendChat = async (e: React.FormEvent) => {
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

  const handleCreatePoll = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQuestion = pollQuestion.trim();
    const cleanOpts = pollOptions.map(o => o.trim()).filter(Boolean);

    if (!cleanQuestion || cleanOpts.length < 2) return;

    signalingClient.sendCreatePoll(cleanQuestion, cleanOpts);

    setPollQuestion('');
    setPollOptions(['', '']);
    setIsCreatingPoll(false);
  };

  const handleAddPollOptionInput = () => {
    if (pollOptions.length < 4) {
      setPollOptions([...pollOptions, '']);
    }
  };

  const handlePollOptionChange = (index: number, val: string) => {
    const updated = [...pollOptions];
    updated[index] = val;
    setPollOptions(updated);
  };

  const handleSendQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    const qText = questionText.trim();
    if (!qText) return;

    signalingClient.sendCreateQuestion(qText, username);
    setQuestionText('');
  };

  const handleVotePoll = (pollId: string, optionId: string) => {
    signalingClient.sendVotePoll(pollId, optionId);
  };

  const handleClosePoll = (pollId: string) => {
    signalingClient.sendClosePoll(pollId);
  };

  const handleDeletePoll = (pollId: string) => {
    signalingClient.sendDeletePoll(pollId);
  };

  const handleUpvoteQuestion = (questionId: string, currentUpvotes: string[]) => {
    const isUpvoted = currentUpvotes.includes(userId);
    signalingClient.sendUpvoteQuestion(questionId, !isUpvoted);
  };

  const handleAnswerQuestion = (questionId: string, currentAnswered: boolean) => {
    signalingClient.sendAnswerQuestion(questionId, !currentAnswered);
  };

  const handleDeleteQuestion = (questionId: string) => {
    signalingClient.sendDeleteQuestion(questionId);
  };

  const quickEmojis = ['👍', '❤️', '😂', '🎉', '😮', '👏', '🔥'];

  return (
    <div className="w-full h-full flex flex-col bg-[#202124] text-[#e8eaed] z-20">
      {/* Tab Select Header */}
      <div className="flex border-b border-white/[0.06] bg-[#292b2f] select-none">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border-b-2 ${
            activeTab === 'chat' ? 'border-[#8ab4f8] text-[#8ab4f8]' : 'border-transparent text-[#9aa0a6] hover:text-[#e8eaed]'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chat</span>
        </button>
        <button
          onClick={() => setActiveTab('polls')}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border-b-2 ${
            activeTab === 'polls' ? 'border-[#8ab4f8] text-[#8ab4f8]' : 'border-transparent text-[#9aa0a6] hover:text-[#e8eaed]'
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5" />
          <span>Polls</span>
          {polls.filter(p => p.isActive).length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#ea4335]" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('qa')}
          className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border-b-2 ${
            activeTab === 'qa' ? 'border-[#8ab4f8] text-[#8ab4f8]' : 'border-transparent text-[#9aa0a6] hover:text-[#e8eaed]'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Q&A</span>
          {questions.filter(q => !q.isAnswered).length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#ea4335]" />
          )}
        </button>
      </div>

      {/* Main Tab Content panels */}
      <div className="flex-grow overflow-y-auto flex flex-col min-h-0">
        
        {/* PANEL A: CHAT VIEW */}
        {activeTab === 'chat' && (
          <div className="flex-grow flex flex-col min-h-0">
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
            <div className="px-4 py-1.5 border-t border-white/[0.06] flex items-center gap-1 bg-[#292b2f]">
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

            {/* Input Form */}
            <form onSubmit={handleSendChat} className="p-3 border-t border-white/[0.06] flex items-center gap-2 bg-[#292b2f]">
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
        )}

        {/* PANEL B: POLLS VIEW */}
        {activeTab === 'polls' && (
          <div className="flex-grow flex flex-col p-4 min-h-0 space-y-4">
            
            {/* Poll builder for hosts */}
            {isHost && (
              <div>
                {!isCreatingPoll ? (
                  <Button onClick={() => setIsCreatingPoll(true)} className="w-full bg-[#8ab4f8] hover:bg-[#aecbfa] text-[#202124] text-xs font-bold py-2">
                    Create New Poll
                  </Button>
                ) : (
                  <form onSubmit={handleCreatePoll} className="bg-[#292b2f] border border-white/[0.06] rounded-xl p-3 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase font-black text-[#8ab4f8]">New Poll Details</span>
                      <button type="button" onClick={() => setIsCreatingPoll(false)} className="text-xs text-[#9aa0a6] hover:text-[#e8eaed]">Cancel</button>
                    </div>
                    <input
                      placeholder="Ask a question..."
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      className="w-full bg-[#3c4043] text-xs rounded-lg px-3 py-2 border-none outline-none focus:ring-1 focus:ring-[#8ab4f8]/50"
                      required
                    />
                    <div className="space-y-1.5">
                      {pollOptions.map((opt, idx) => (
                        <input
                          key={idx}
                          placeholder={`Option ${idx + 1}`}
                          value={opt}
                          onChange={(e) => handlePollOptionChange(idx, e.target.value)}
                          className="w-full bg-[#3c4043] text-xs rounded-lg px-3 py-1.5 border-none outline-none focus:ring-1 focus:ring-[#8ab4f8]/50"
                          required={idx < 2}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between items-center pt-1.5">
                      {pollOptions.length < 4 ? (
                        <button
                          type="button"
                          onClick={handleAddPollOptionInput}
                          className="text-[10px] text-[#8ab4f8] hover:underline"
                        >
                          + Add Option
                        </button>
                      ) : <span />}
                      <Button type="submit" disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2} className="text-[10px] px-3 py-1 bg-[#8ab4f8] text-[#202124] font-bold rounded-full">
                        Launch Poll
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* List of launched polls */}
            <div className="flex-grow overflow-y-auto space-y-3">
              {polls.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center">
                  <BarChart2 className="w-8 h-8 text-[#5f6368] mb-2" />
                  <p className="text-xs text-[#9aa0a6]">No polls have been launched yet.</p>
                </div>
              ) : (
                [...polls].reverse().map((poll) => {
                  const hasVoted = poll.options.some(opt => opt.votes.includes(userId));
                  const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);

                  return (
                    <div key={poll.id} className="bg-[#292b2f] border border-white/[0.06] rounded-xl p-4.5 space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-xs font-bold text-[#e8eaed] leading-snug">{poll.question}</h4>
                          <span className="text-[9px] text-[#9aa0a6] block mt-0.5">By {poll.creatorName}</span>
                        </div>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                          poll.isActive ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-[#3c4043] text-[#9aa0a6]'
                        }`}>
                          {poll.isActive ? 'Active' : 'Closed'}
                        </span>
                      </div>

                      {/* Options rendering */}
                      <div className="space-y-2">
                        {poll.options.map((opt) => {
                          const userVoted = opt.votes.includes(userId);
                          const percentage = totalVotes > 0 ? Math.round((opt.votes.length / totalVotes) * 100) : 0;

                          if (poll.isActive && !hasVoted) {
                            return (
                              <button
                                key={opt.id}
                                onClick={() => handleVotePoll(poll.id, opt.id)}
                                className="w-full text-left p-2.5 bg-[#3c4043] hover:bg-[#4a4d52] transition-colors rounded-lg text-xs font-medium cursor-pointer"
                              >
                                {opt.text}
                              </button>
                            );
                          }

                          return (
                            <div key={opt.id} className="space-y-1">
                              <div className="flex justify-between text-xs font-medium">
                                <span className={userVoted ? 'text-[#8ab4f8] font-bold' : 'text-[#e8eaed]'}>
                                  {opt.text} {userVoted ? '✓' : ''}
                                </span>
                                <span className="text-[#9aa0a6]">{opt.votes.length} ({percentage}%)</span>
                              </div>
                              <div className="w-full h-1.5 bg-[#3c4043] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${userVoted ? 'bg-[#8ab4f8]' : 'bg-[#9aa0a6]'}`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Vote statistics and host controls */}
                      <div className="flex justify-between items-center pt-2 border-t border-white/[0.04]">
                        <span className="text-[10px] text-[#9aa0a6] font-medium">{totalVotes} total votes</span>
                        {isHost && (
                          <div className="flex space-x-2">
                            {poll.isActive && (
                              <button
                                onClick={() => handleClosePoll(poll.id)}
                                className="text-[9px] font-bold text-amber-400 hover:underline flex items-center space-x-0.5 cursor-pointer"
                              >
                                <Square className="w-2.5 h-2.5" />
                                <span>Close</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleDeletePoll(poll.id)}
                              className="text-[9px] font-bold text-red-400 hover:underline flex items-center space-x-0.5 cursor-pointer"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* PANEL C: Q&A VIEW */}
        {activeTab === 'qa' && (
          <div className="flex-grow flex flex-col p-4 min-h-0 space-y-4">
            
            {/* Input Form */}
            <form onSubmit={handleSendQuestion} className="bg-[#292b2f] border border-white/[0.06] p-3.5 rounded-xl space-y-2 flex-shrink-0">
              <span className="text-[10px] uppercase font-black text-[#8ab4f8]">Ask the presenter</span>
              <div className="flex gap-2">
                <input
                  placeholder="Ask a question..."
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  className="flex-1 bg-[#3c4043] text-xs rounded-lg px-3.5 py-2 border-none outline-none focus:ring-1 focus:ring-[#8ab4f8]/50 text-[#e8eaed]"
                />
                <Button type="submit" disabled={!questionText.trim()} className="px-3 bg-[#8ab4f8] text-[#202124] font-bold rounded-lg text-xs shrink-0">
                  Ask
                </Button>
              </div>
            </form>

            {/* List of questions */}
            <div className="flex-grow overflow-y-auto space-y-3">
              {questions.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-center">
                  <HelpCircle className="w-8 h-8 text-[#5f6368] mb-2" />
                  <p className="text-xs text-[#9aa0a6]">No questions have been posted yet.</p>
                </div>
              ) : (
                [...questions].sort((a, b) => b.upvotes.length - a.upvotes.length).map((q) => {
                  const hasUpvoted = q.upvotes.includes(userId);

                  return (
                    <div key={q.id} className="bg-[#292b2f] border border-white/[0.06] rounded-xl p-4 space-y-2.5 transition-all">
                      <div className="flex justify-between items-start gap-3">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-[#e8eaed] leading-snug break-words">{q.text}</p>
                          <div className="flex items-center space-x-1.5 text-[9px] text-[#9aa0a6]">
                            <span className="font-bold">{q.username}</span>
                            <span>·</span>
                            <span>
                              {new Date(q.createdAt).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>

                        {/* Status Checkmark */}
                        {q.isAnswered && (
                          <span className="flex items-center text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full select-none">
                            <Check className="w-2.5 h-2.5 mr-0.5" />
                            <span>Answered</span>
                          </span>
                        )}
                      </div>

                      {/* Vote/Host action controls */}
                      <div className="flex justify-between items-center pt-2 border-t border-white/[0.04] select-none">
                        {/* Upvote Button */}
                        <button
                          onClick={() => handleUpvoteQuestion(q.id, q.upvotes)}
                          className={`flex items-center space-x-1 text-xs font-bold transition-all cursor-pointer ${
                            hasUpvoted ? 'text-[#8ab4f8]' : 'text-[#9aa0a6] hover:text-[#e8eaed]'
                          }`}
                        >
                          <ThumbsUp className={`w-3.5 h-3.5 ${hasUpvoted ? 'fill-current' : ''}`} />
                          <span>{q.upvotes.length}</span>
                        </button>

                        {/* Host controls */}
                        {isHost && (
                          <div className="flex space-x-2.5">
                            <button
                              onClick={() => handleAnswerQuestion(q.id, q.isAnswered)}
                              className={`text-[9px] font-bold hover:underline flex items-center space-x-0.5 cursor-pointer ${
                                q.isAnswered ? 'text-amber-400' : 'text-emerald-400'
                              }`}
                            >
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>{q.isAnswered ? 'Reopen' : 'Answered'}</span>
                            </button>
                            <button
                              onClick={() => handleDeleteQuestion(q.id)}
                              className="text-[9px] font-bold text-red-400 hover:underline flex items-center space-x-0.5 cursor-pointer"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPanel;
