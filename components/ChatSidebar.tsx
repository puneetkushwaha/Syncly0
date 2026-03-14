"use client";

import { useState, useEffect, useRef } from "react";
import { Send, User as UserIcon } from "lucide-react";

interface Message {
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
}

interface ChatSidebarProps {
  messages: Message[];
  onSendMessage: (msg: string) => void;
  currentUserId: string;
}

export default function ChatSidebar({ messages, onSendMessage, currentUserId }: ChatSidebarProps) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onSendMessage(text);
      setText("");
    }
  };

  return (
    <div className="w-80 h-full flex flex-col glass rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h2 className="font-semibold text-gray-200">Theatre Chat</h2>
        <span className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded-full">Live</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div 
            key={i} 
            className={`flex flex-col ${msg.userId === currentUserId ? 'items-end' : 'items-start'}`}
          >
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
              msg.userId === currentUserId 
                ? 'bg-purple-600/40 text-white rounded-tr-none' 
                : 'bg-white/10 text-gray-200 rounded-tl-none'
            }`}>
              <div className="text-[10px] opacity-50 mb-1 font-medium">{msg.userName}</div>
              {msg.message}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-4 bg-white/5 border-t border-white/10">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Type a message..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
          <button 
            type="submit"
            className="p-2 bg-purple-600 rounded-full hover:bg-purple-500 transition-colors"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </form>
    </div>
  );
}
