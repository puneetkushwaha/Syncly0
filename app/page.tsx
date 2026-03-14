"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Users, FolderOpen, Link as LinkIcon, Heart } from "lucide-react";

export default function Lobby() {
  const [roomId, setRoomId] = useState("");
  const router = useRouter();

  const createRoom = () => {
    const id = Math.random().toString(36).substring(2, 9);
    router.push(`/room/${id}`);
  };

  const joinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      router.push(`/room/${roomId.trim()}`);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 relative">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-pink-600/20 blur-[120px] rounded-full" />

      <div className="z-10 w-full max-w-4xl flex flex-col items-center text-center space-y-12">
        {/* Hero Section */}
        <div className="space-y-4">
          <div className="inline-flex items-center space-x-2 px-4 py-2 rounded-full glass mb-4">
            <Heart className="w-4 h-4 text-pink-500 fill-pink-500" />
            <span className="text-sm font-medium text-gray-300">Perfect for Long Distance</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter">
            Watch <span className="gradient-text">Together</span>, <br />
            Anywhere.
          </h1>
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto">
            Sync movies from your local storage, Hotstar, or Netflix with your partner in real-time. 
            No latency, just pure cinematic connection.
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 gap-8 w-full max-w-3xl">
          <div className="glass p-8 rounded-3xl space-y-6 flex flex-col items-center text-center group transition-all duration-500 hover:scale-[1.02]">
            <div className="w-16 h-16 rounded-2xl bg-purple-600/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Play className="w-8 h-8 text-purple-400" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold mb-2">Create a Theatre</h3>
              <p className="text-gray-400 text-sm">Start a private session and invite your partner instantly.</p>
            </div>
            <button 
              onClick={createRoom}
              className="btn-primary w-full flex items-center justify-center space-x-2"
            >
              <span>Start Streaming</span>
              <Play className="w-4 h-4 fill-white" />
            </button>
          </div>

          <div className="glass p-8 rounded-3xl space-y-6 flex flex-col items-center text-center group transition-all duration-500 hover:scale-[1.02]">
            <div className="w-16 h-16 rounded-2xl bg-pink-600/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-8 h-8 text-pink-400" />
            </div>
            <div>
              <h3 className="text-2xl font-semibold mb-2">Join a Partner</h3>
              <p className="text-gray-400 text-sm">Got a room ID? Jump straight into the action.</p>
            </div>
            <form onSubmit={joinRoom} className="w-full flex space-x-2">
              <input 
                type="text" 
                placeholder="Enter Room ID" 
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-full px-6 py-3 flex-1 focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all"
              />
              <button 
                type="submit"
                className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                <LinkIcon className="w-5 h-5 text-gray-300" />
              </button>
            </form>
          </div>
        </div>

        {/* Features Minimal */}
        <div className="flex flex-wrap justify-center gap-8 pt-8">
          <div className="flex items-center space-x-2 text-gray-500">
            <FolderOpen className="w-5 h-5" />
            <span>Local Files</span>
          </div>
          <div className="flex items-center space-x-2 text-gray-500">
            <LinkIcon className="w-5 h-5" />
            <span>Hotstar / Netflix</span>
          </div>
          <div className="flex items-center space-x-2 text-gray-500">
            <Users className="w-5 h-5" />
            <span>Real-time Sync</span>
          </div>
        </div>
      </div>
    </main>
  );
}
