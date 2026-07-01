import React, { useState, useRef, useEffect } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';
import { Send, Trash2, MessageSquare, BarChart2, HelpCircle, ThumbsUp } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';

interface ChatPanelProps {
  roomId: string;
  userId: string;
  username: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ roomId, userId, username }) => {
  const { chatMessages, polls, questions, myRole, isChatLocked } = useMeetingStore();
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
  const isChatInputLocked = isChatLocked && !isHost;

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
    if (isChatInputLocked) return;
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
        body: JSON.stringify({
          message: messageText,
          senderName: username
        })
      });
    } catch (err) {
      console.error('Failed to post chat on server:', err);
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

  // Poll management
  const handleAddOption = () => {
    setPollOptions([...pollOptions, '']);
  };

  const handleOptionChange = (idx: number, val: string) => {
    const next = [...pollOptions];
    next[idx] = val;
    setPollOptions(next);
  };

  const handleCreatePoll = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOptions = pollOptions.filter(o => o.trim());
    if (!pollQuestion.trim() || cleanOptions.length < 2) return;

    signalingClient.sendCreatePoll(pollQuestion.trim(), cleanOptions);

    setPollQuestion('');
    setPollOptions(['', '']);
    setIsCreatingPoll(false);
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

  // Q&A management
  const handleSendQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;

    signalingClient.sendCreateQuestion(questionText.trim(), username);
    setQuestionText('');
  };

  const handleUpvoteQuestion = (questionId: string) => {
    const q = questions.find(quest => quest.id === questionId);
    const hasUpvoted = q?.upvotes?.includes(userId) || false;
    signalingClient.sendUpvoteQuestion(questionId, !hasUpvoted);
  };

  const handleToggleAnswerQuestion = (questionId: string, isAnswered: boolean) => {
    signalingClient.sendAnswerQuestion(questionId, !isAnswered);
  };

  const handleDeleteQuestion = (questionId: string) => {
    signalingClient.sendDeleteQuestion(questionId);
  };

  const quickEmojis = ['👍', '👎', '😂', '🔥', '🎉', '❤️'];

  return (
    <div className="w-full h-full flex flex-col bg-[#1e2022] text-[#e3e2e6] select-none">
      
      {/* M3 Segmented Navigation Tabs */}
      <div className="flex bg-[#131417] p-1 border-b border-white/[0.08] flex-shrink-0 gap-1">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 py-2 text-[11px] font-bold rounded-full transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'chat' ? 'bg-[#a8c7fa] text-[#062e6f]' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
        </button>
        <button
          onClick={() => setActiveTab('polls')}
          className={`flex-1 py-2 text-[11px] font-bold rounded-full transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'polls' ? 'bg-[#a8c7fa] text-[#062e6f]' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Polls
        </button>
        <button
          onClick={() => setActiveTab('qa')}
          className={`flex-1 py-2 text-[11px] font-bold rounded-full transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'qa' ? 'bg-[#a8c7fa] text-[#062e6f]' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Q&A
        </button>
      </div>

      {/* TAB A: CHAT VIEW */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col min-h-0 bg-[#1e2022]">
          {/* Messages Area */}
          <div className="flex-grow overflow-y-auto p-4 space-y-4 select-text">
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-white/30 space-y-2">
                <MessageSquare className="w-8 h-8 opacity-40 text-[#a8c7fa]" />
                <p className="text-xs font-semibold">No messages in call yet</p>
                <p className="text-[10px] opacity-70">Say hi to start the conversation!</p>
              </div>
            ) : (
              chatMessages.map((msg) => {
                const isMe = msg.userId === userId || msg.senderId === signalingClient.getSocketId();
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] text-white/50">
                      <span className="font-bold">{msg.username}</span>
                      <span>·</span>
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <div className={`px-4 py-2.5 text-xs rounded-[20px] max-w-[85%] break-words shadow-sm leading-normal ${
                      isMe 
                        ? 'bg-[#a8c7fa] text-[#062e6f] rounded-tr-none' 
                        : 'bg-[#282a2d] text-white/90 rounded-tl-none'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Emojis Area */}
          <div className="px-4 py-1.5 border-t border-white/[0.08] flex items-center justify-center gap-1 bg-[#131417] flex-shrink-0">
            {isChatInputLocked && (
              <span className="text-[10px] text-[#fde293] font-bold mr-1">Chat locked by host</span>
            )}
            {quickEmojis.map(emoji => (
              <button
                key={emoji}
                disabled={isChatInputLocked}
                onClick={async () => {
                  if (isChatInputLocked) return;
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
                    signalingClient.sendChatWithDetails(roomId, username, emoji, userId); 
                  } else { 
                    signalingClient.sendChat(emoji); 
                  }
                }}
                className="hover:scale-110 transition-transform p-1 text-sm rounded-full hover:bg-white/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSendChat} className="p-3 border-t border-white/[0.08] flex items-center gap-2 bg-[#131417] flex-shrink-0">
            <input
              placeholder="Send a message..."
              value={text}
              disabled={isChatInputLocked}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 bg-[#1e2022] text-white placeholder-white/30 rounded-full px-4.5 py-2.5 text-xs border border-white/10 outline-none focus:outline-none focus:border-[#a8c7fa] disabled:opacity-50"
            />
            <button 
              type="submit" 
              disabled={!text.trim() || isChatInputLocked} 
              className="w-9 h-9 rounded-full bg-[#a8c7fa] hover:bg-[#c4eed0] disabled:bg-[#303134] text-[#062e6f] disabled:text-white/20 flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* TAB B: POLLS VIEW */}
      {activeTab === 'polls' && (
        <div className="flex-1 flex flex-col p-4 min-h-0 space-y-4 overflow-y-auto bg-[#1e2022]">
          
          {/* Launch Poll triggers */}
          {!isCreatingPoll ? (
            <button
              onClick={() => setIsCreatingPoll(true)}
              className="w-full py-2.5 bg-[#a8c7fa] text-[#062e6f] font-bold rounded-full text-xs transition-all cursor-pointer text-center block"
            >
              Create New Poll
            </button>
          ) : (
            <form onSubmit={handleCreatePoll} className="bg-[#131417] border border-white/[0.08] rounded-[20px] p-4 space-y-3">
              <h3 className="text-xs font-bold text-white mb-1">New Poll</h3>
              <div className="space-y-1">
                <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider">Question</label>
                <input
                  type="text"
                  placeholder="What is our launch target?"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  className="w-full bg-[#1e2022] text-xs rounded-xl px-3 py-2 border border-white/15 outline-none focus:border-[#a8c7fa] text-white"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-white/50 font-bold uppercase tracking-wider block">Options</label>
                {pollOptions.map((opt, index) => (
                  <input
                    key={index}
                    type="text"
                    placeholder={`Option ${index + 1}`}
                    value={opt}
                    onChange={(e) => handleOptionChange(index, e.target.value)}
                    className="w-full bg-[#1e2022] text-xs rounded-xl px-3 py-1.5 border border-white/15 outline-none focus:border-[#a8c7fa] text-white"
                    required={index < 2}
                  />
                ))}
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={handleAddOption}
                  className="text-xs text-[#a8c7fa] hover:underline font-bold"
                >
                  + Add Option
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCreatingPoll(false)}
                    className="px-3 py-1.5 bg-[#303134] text-white/80 hover:text-white rounded-full text-[10px] font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                    className="px-4.5 py-1.5 bg-[#a8c7fa] text-[#062e6f] font-bold rounded-full text-[10px] disabled:opacity-40"
                  >
                    Launch
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Active Polls Lists */}
          <div className="space-y-4">
            {polls.length === 0 ? (
              <p className="text-center text-xs text-white/30 py-8">No polls launched in this room</p>
            ) : (
              [...polls].reverse().map((poll) => {
                const totalVotes = poll.options.reduce((acc, curr) => acc + (curr.votes?.length || 0), 0);
                const userVotedOptionIdx = poll.options.findIndex(opt => opt.votes?.includes(userId));
                const userVoted = userVotedOptionIdx !== -1;

                return (
                  <div key={poll.id} className="bg-[#131417] border border-white/[0.08] rounded-[20px] p-4 space-y-3.5 text-left">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          poll.isActive ? 'bg-[#c4eed0]/10 border-[#c4eed0]/25 text-[#c4eed0]' : 'bg-[#f2b8b5]/10 border-[#f2b8b5]/25 text-[#f2b8b5]'
                        }`}>
                          {poll.isActive ? 'Active' : 'Closed'}
                        </span>
                        <h4 className="text-xs font-bold text-white mt-2 leading-relaxed">{poll.question}</h4>
                      </div>
                      {isHost && (
                        <button
                          onClick={() => handleDeletePoll(poll.id)}
                          className="text-white/40 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-all"
                          title="Delete Poll"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Options list */}
                    <div className="space-y-2.5">
                      {poll.options.map((opt, idx) => {
                        const optVotes = opt.votes?.length || 0;
                        const percentage = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                        const hasSelectedThis = idx === userVotedOptionIdx;

                        return (
                          <div key={idx} className="space-y-1">
                            {poll.isActive && !userVoted ? (
                              <button
                                onClick={() => handleVotePoll(poll.id, opt.id)}
                                className="w-full text-left p-2.5 bg-[#1e2022] hover:bg-[#282a2d] border border-white/5 transition-colors rounded-xl text-xs font-medium cursor-pointer"
                              >
                                {opt.text}
                              </button>
                            ) : (
                              <div className="p-2.5 bg-[#1e2022] border border-white/5 rounded-xl text-xs flex flex-col gap-1.5 relative overflow-hidden">
                                <div className="flex justify-between z-10 font-medium">
                                  <span className={hasSelectedThis ? 'text-[#a8c7fa] font-bold' : 'text-white/80'}>
                                    {opt.text} {hasSelectedThis && '✓'}
                                  </span>
                                  <span className="text-white/50">{optVotes} votes ({percentage}%)</span>
                                </div>
                                <div className="w-full h-1.5 bg-[#303134] rounded-full overflow-hidden z-10">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-500 ${hasSelectedThis ? 'bg-[#a8c7fa]' : 'bg-[#c2c6dc]'}`}
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-white/50 pt-1.5 border-t border-white/[0.04]">
                      <span>Total Votes: {totalVotes}</span>
                      {isHost && poll.isActive && (
                        <button
                          onClick={() => handleClosePoll(poll.id)}
                          className="px-3 py-1 bg-[#303134] hover:bg-[#3c4043] text-white rounded-full font-bold cursor-pointer"
                        >
                          End Poll
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB C: Q&A VIEW */}
      {activeTab === 'qa' && (
        <div className="flex-1 flex flex-col p-4 min-h-0 bg-[#1e2022] space-y-4">
          
          {/* Ask form */}
          <form onSubmit={handleSendQuestion} className="bg-[#131417] border border-white/[0.08] p-3 rounded-[20px] space-y-3.5 flex-shrink-0 text-left">
            <h3 className="text-xs font-bold text-white">Ask a Question</h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="What is the release deadline?"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                className="flex-1 bg-[#1e2022] text-xs rounded-xl px-3 py-2 border border-white/15 outline-none focus:border-[#a8c7fa] text-[#e3e2e6]"
                required
              />
              <button
                type="submit"
                disabled={!questionText.trim()}
                className="px-4 bg-[#a8c7fa] hover:bg-[#c4eed0] text-[#062e6f] font-bold rounded-full text-xs transition-all cursor-pointer flex-shrink-0"
              >
                Ask
              </button>
            </div>
          </form>

          {/* Questions list */}
          <div className="flex-grow overflow-y-auto space-y-3.5 pr-1 text-left">
            {questions.length === 0 ? (
              <p className="text-center text-xs text-white/30 py-8">No questions asked yet</p>
            ) : (
              [...questions]
                .sort((a, b) => (b.upvotes?.length || 0) - (a.upvotes?.length || 0))
                .map((q) => {
                  const hasUpvoted = q.upvotes?.includes(userId);
                  const upvoteCount = q.upvotes?.length || 0;

                  return (
                    <div key={q.id} className="bg-[#131417] border border-white/[0.08] rounded-[20px] p-4 space-y-2.5 transition-all">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[10px] text-white/40">
                            <span className="font-bold truncate">{q.username}</span>
                            <span>·</span>
                            <span>
                              {new Date(q.createdAt).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-white mt-1 leading-relaxed break-words">{q.text}</p>
                        </div>
                        {isHost && (
                          <button
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="text-white/40 hover:text-red-400 p-0.5 rounded hover:bg-white/5 transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Footer actions */}
                      <div className="flex items-center justify-between pt-2 border-t border-white/[0.04] text-[10px]">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUpvoteQuestion(q.id)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                              hasUpvoted 
                                ? 'bg-[#a8c7fa]/10 border-[#a8c7fa]/25 text-[#a8c7fa] font-bold' 
                                : 'bg-[#1e2022] border-white/5 text-white/60 hover:text-white'
                            }`}
                          >
                            <ThumbsUp className="w-3 h-3" />
                            <span>{upvoteCount}</span>
                          </button>

                          {q.isAnswered && (
                            <span className="flex items-center text-[9px] bg-[#c4eed0]/10 text-[#c4eed0] border border-[#c4eed0]/20 px-2 py-0.5 rounded-full select-none font-bold">
                              Answered
                            </span>
                          )}
                        </div>

                        {isHost && (
                          <button
                            onClick={() => handleToggleAnswerQuestion(q.id, q.isAnswered)}
                            className={`px-3 py-1 rounded-full transition-colors font-bold cursor-pointer ${
                              q.isAnswered 
                                ? 'bg-[#303134] text-white/70 hover:text-white' 
                                : 'bg-[#c4eed0] text-[#072711] hover:bg-[#e0f8e9]'
                            }`}
                          >
                            {q.isAnswered ? 'Mark Unanswered' : 'Mark Answered'}
                          </button>
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
  );
};

export default ChatPanel;
