"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { LogOut, Video, FileVideo, Globe, Share2, Music, Mic, MicOff, Video as VideoIcon, VideoOff, Monitor } from "lucide-react";
import { useSocket } from "@/hooks/useSocket";
import VideoPlayer from "@/components/VideoPlayer";
import ChatSidebar from "@/components/ChatSidebar";
import { Peer } from "peerjs";

export default function Room() {
  const params = useParams();
  const roomId = params.id as string;
  const router = useRouter();
  
  // State
  const [isJoined, setIsJoined] = useState(false);
  const [tempName, setTempName] = useState("");
  const [userName, setUserName] = useState("");
  const [userId] = useState(() => Math.random().toString(36).substring(7));
  
  // Socket & Peer
  const socket = useSocket(roomId, userId, isJoined ? userName : undefined);
  const [peerReady, setPeerReady] = useState(false);
  
  // Refs for stability
  const peerRef = useRef<Peer | null>(null);
  const videoPlayerRef = useRef<any>(null);
  const localChatStreamRef = useRef<MediaStream | null>(null);
  const movieStreamRef = useRef<MediaStream | null>(null);
  const calledUsersRef = useRef<Set<string>>(new Set()); // For movie stream
  const calledChatUsersRef = useRef<Map<string, any>>(new Map()); // userId -> call object

  // State
  const [messages, setMessages] = useState<any[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null); 
  const [localChatStream, setLocalChatStream] = useState<MediaStream | null>(null);
  const [remoteChatStream, setRemoteChatStream] = useState<MediaStream | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState<any[]>([]); 
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState("");
  
  // Media Toggles
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);

  // Initialize Local Chat Stream
  const initChatMedia = async (audio: boolean, video: boolean) => {
    try {
      console.log(`Initializing local chat media (A:${audio}, V:${video})...`);
      
      let needsReacquire = false;
      if (localChatStreamRef.current) {
        const tracks = localChatStreamRef.current.getTracks();
        if ((audio && !tracks.some(t => t.kind === 'audio')) || (video && !tracks.some(t => t.kind === 'video'))) {
          needsReacquire = true;
        }
      } else {
        needsReacquire = true;
      }

      if (needsReacquire) {
        if (localChatStreamRef.current) {
          localChatStreamRef.current.getTracks().forEach(t => t.stop());
        }
        const ms = await navigator.mediaDevices.getUserMedia({ audio, video });
        localChatStreamRef.current = ms;
        setLocalChatStream(ms);
        
        // Close old chat calls to re-negotiate with new stream
        calledChatUsersRef.current.forEach(call => call.close());
        calledChatUsersRef.current.clear();
      } else if (localChatStreamRef.current) {
        if (audio) localChatStreamRef.current.getAudioTracks().forEach(t => t.enabled = true);
        if (video) localChatStreamRef.current.getVideoTracks().forEach(t => t.enabled = true);
      }
      
      const streamToSend = localChatStreamRef.current;
      if (streamToSend && isJoined && peerRef.current) {
        connectedUsers.forEach(user => {
          if (!calledChatUsersRef.current.has(user.userId)) {
            console.log("Calling partner for chat:", user.userName);
            const call = peerRef.current?.call(user.userId, streamToSend, { metadata: { type: "chat" } });
            if (call) calledChatUsersRef.current.set(user.userId, call);
          }
        });
      }
      
      return streamToSend;
    } catch (err) {
      console.error("Media access error:", err);
      return null;
    }
  };

  const toggleMic = async () => {
    const nextValue = !isMicOn;
    setIsMicOn(nextValue);
    
    if (localChatStreamRef.current && localChatStreamRef.current.getAudioTracks().length > 0) {
      localChatStreamRef.current.getAudioTracks().forEach(t => t.enabled = nextValue);
    } else if (nextValue) {
      await initChatMedia(true, isCamOn);
    }
  };

  const toggleCam = async () => {
    const nextValue = !isCamOn;
    setIsCamOn(nextValue);
    
    if (localChatStreamRef.current && localChatStreamRef.current.getVideoTracks().length > 0) {
      localChatStreamRef.current.getVideoTracks().forEach(t => t.enabled = nextValue);
    } else if (nextValue) {
      await initChatMedia(isMicOn, true);
    }
  };

  // Persistent Peer Setup
  useEffect(() => {
    if (typeof window === "undefined" || !socket || !isJoined) return;

    console.log("Setting up PeerJS for UID:", userId);
    const peer = new Peer(userId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ]
      }
    });
    peerRef.current = peer;

    peer.on("open", (id) => {
      console.log("PeerJS open. ID:", id);
      setPeerReady(true);
      socket.emit("peer-ready", { roomId, userId });
    });

    peer.on("call", (call: any) => {
      const callType = call.metadata?.type || "movie";
      const callerId = call.peer;
      console.log(`Receiving ${callType} call from ${callerId}...`);
      
      call.answer(localChatStreamRef.current || undefined); 
      
      call.on("stream", (remoteStream: MediaStream) => {
        console.log(`Stream received for type ${callType}. Tracks:`, remoteStream.getTracks().map(t => t.kind));
        if (callType === "chat") {
          setRemoteChatStream(remoteStream);
        } else {
          setStream(remoteStream);
        }
      });

      call.on("error", (err: any) => console.error(`Peer call error (${callType}):`, err));
      call.on("close", () => {
        if (callType === "chat") setRemoteChatStream(null);
      });
    });

    socket.on("room-users", (users: any[]) => {
      console.log("Existing room users:", users);
      setConnectedUsers(users);
    });

    socket.on("peer-ready", ({ userId: readyId }: { userId: string }) => {
      console.log(`Remote user ${readyId} is Peer-Ready.`);
      
      // Share movie if we are host
      if (movieStreamRef.current && isHost) {
        console.log("Sharing movie with newcomer...");
        const call = peer.call(readyId, movieStreamRef.current, { metadata: { type: "movie" } });
        if (call?.peerConnection) {
          const pc = call.peerConnection as RTCPeerConnection;
          pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') optimizeConnection(pc); };
        }
        calledUsersRef.current.add(readyId);
      }
      
      // Share chat if active
      if (localChatStreamRef.current) {
        console.log("Sharing chat with newcomer...");
        const chatCall = peer.call(readyId, localChatStreamRef.current, { metadata: { type: "chat" } });
        if (chatCall) calledChatUsersRef.current.set(readyId, chatCall);
      }
    });

    socket.on("user-joined", (user: any) => {
      console.log("User joined:", user.userName);
      setConnectedUsers(prev => [...prev.filter(u => u.userId !== user.userId), user]);
    });

    socket.on("user-left", ({ userId: leftId }: { userId: string }) => {
      console.log("Partner left room:", leftId);
      setConnectedUsers(prev => prev.filter(u => u.userId !== leftId));
      calledUsersRef.current.delete(leftId);
      
      const chatCall = calledChatUsersRef.current.get(leftId);
      if (chatCall) {
        chatCall.close();
        calledChatUsersRef.current.delete(leftId);
      }
      
      setRemoteChatStream(null); 
    });

    socket.on("chat-message", (msg: any) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on("sync-playback", ({ type, time }: any) => {
      console.log("Sync event:", type, time);
      if (type === "play") videoPlayerRef.current?.syncPlay(time);
      if (type === "pause") videoPlayerRef.current?.syncPause(time);
      if (type === "seek") videoPlayerRef.current?.syncSeek(time);
    });

    socket.on("sync-link", ({ url }: { url: string }) => {
      console.log("Switching to sync link:", url);
      setExternalUrl(url);
      setStream(null);
    });

    return () => {
      console.log("Cleaning up Room...");
      peer.destroy();
      socket.off("peer-ready");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("room-users");
      socket.off("chat-message");
      socket.off("sync-playback");
      socket.off("sync-link");
    };
  }, [socket, userId, isJoined]);

  // Separate effect to handle movie stream sharing when it changes or we become host
  useEffect(() => {
    movieStreamRef.current = stream;
    if (stream && isHost && peerRef.current && isJoined) {
      connectedUsers.forEach(user => {
        if (!calledUsersRef.current.has(user.userId)) {
          console.log("Initiating movie call to partner:", user.userId);
          const call = peerRef.current?.call(user.userId, stream, { metadata: { type: "movie" } });
          calledUsersRef.current.add(user.userId);
          if (call?.peerConnection) {
            const pc = call.peerConnection as RTCPeerConnection;
            pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') optimizeConnection(pc); };
          }
        }
      });
    }
  }, [stream, isHost, connectedUsers, isJoined]);

  // Bitrate Optimization Utility
  const optimizeConnection = (pc: RTCPeerConnection) => {
    pc.getSenders().forEach(sender => {
      if (sender.track?.kind === 'video') {
        const parameters = sender.getParameters();
        if (!parameters.encodings) parameters.encodings = [{}];
        parameters.encodings[0].maxBitrate = 8 * 1000 * 1000; 
        parameters.encodings[0].maxFramerate = 30;
        sender.setParameters(parameters).catch(err => console.error("Bitrate opt error:", err));
      }
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.style.position = "fixed";
      video.style.opacity = "0";
      video.style.pointerEvents = "none";
      document.body.appendChild(video);
      
      video.onloadedmetadata = () => {
        video.play().then(() => {
          // @ts-ignore
          const mediaStream = video.captureStream ? video.captureStream(30) : (video as any).mozCaptureStream(30);
          const videoTrack = mediaStream.getVideoTracks()[0];
          if (videoTrack && 'contentHint' in videoTrack) (videoTrack as any).contentHint = 'motion';

          setStream(mediaStream);
          setExternalUrl(null);
          setIsHost(true);
          calledUsersRef.current.clear(); // Reset called users for new stream

          socket?.emit("chat-message", {
            roomId, userId, userName,
            message: `🎬 Started streaming movie: ${file.name}`
          });
        });
      };
    }
  };

  const handleScreenShare = async () => {
    try {
      console.log("Starting screen share...");
      const ms = await navigator.mediaDevices.getDisplayMedia({ 
        video: { 
          // @ts-ignore
          cursor: "always",
          // @ts-ignore
          displaySurface: "browser" 
        }, 
        audio: true 
      });
      
      // Handle sudden stop of screen share (browser button)
      ms.getVideoTracks()[0].onended = () => {
        setStream(null);
        setIsHost(false);
      };

      setStream(ms);
      setExternalUrl(null);
      setIsHost(true);
      calledUsersRef.current.clear();
      
      socket?.emit("chat-message", { 
        roomId, userId, userName, 
        message: "🖥️ Started premium screen share (Hotstar/Netflix support)" 
      });
    } catch (err) {
      console.error("Screen share error:", err);
    }
  };

  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (linkInput.trim()) {
      const url = linkInput.trim();
      const needsWarning = url.includes('hotstar.com') || url.includes('netflix.com') || url.includes('disneyplus.com') || url.includes('primevideo.com');
      
      if (needsWarning) {
        alert("⚠️ Note: Premium sites like Hotstar/Netflix block embedded playback for security. If it doesn't load, please use the 'Local Master' (local files) or a direct video link.");
      }

      setExternalUrl(url);
      setStream(null);
      setIsHost(true);
      socket?.emit("sync-link", { roomId, url });
      socket?.emit("chat-message", { roomId, userId, userName, message: `🔗 Shared a link: ${url}` });
      setLinkInput("");
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempName.trim()) {
      setUserName(tempName.trim());
      setIsJoined(true);
      // Immediately start media if previously toggled in lobby
      if (isMicOn || isCamOn) {
        initChatMedia(isMicOn, isCamOn);
      }
    }
  };

  if (!isJoined) {
    return (
      <div className="h-screen bg-[#020202] flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-black to-black">
        <div className="w-full max-w-lg space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="text-center space-y-3">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-2xl shadow-purple-500/20 mb-6">
              <Video className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-black text-white tracking-tighter">CineTogether</h1>
            <p className="text-gray-400 text-lg font-medium italic">Premium Co-Watching Experience</p>
          </div>

          <div className="glass p-8 rounded-[2.5rem] border border-white/5 space-y-6 shadow-2xl">
            <div className="space-y-4">
              <label className="text-xs font-black uppercase tracking-[0.3em] text-purple-400 ml-1">Your Identity</label>
              <form onSubmit={handleJoin} className="relative group">
                <input 
                  type="text" 
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="Enter your name..." 
                  autoFocus
                  className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-purple-500/50 transition-all font-bold text-lg"
                />
                <button 
                  type="submit"
                  disabled={!tempName.trim()}
                  className="absolute right-2 top-2 bottom-2 bg-gradient-to-r from-purple-600 to-pink-600 disabled:opacity-30 disabled:scale-95 px-6 rounded-xl text-sm font-bold transition-all hover:scale-105 active:scale-90 shadow-lg shadow-purple-500/20"
                >
                  Join Room
                </button>
              </form>
            </div>

            <div className="flex items-center space-x-4">
              <button 
                onClick={toggleMic}
                className={`flex-1 flex flex-col items-center p-6 rounded-2xl border transition-all ${isMicOn ? 'bg-purple-600/10 border-purple-500/30 text-purple-400' : 'bg-white/5 border-white/5 text-gray-500'}`}
              >
                {isMicOn ? <Mic className="w-6 h-6 mb-2" /> : <MicOff className="w-6 h-6 mb-2" />}
                <span className="text-[10px] font-black uppercase tracking-widest">Mic {isMicOn ? 'On' : 'Off'}</span>
              </button>
              <button 
                onClick={toggleCam}
                className={`flex-1 flex flex-col items-center p-6 rounded-2xl border transition-all ${isCamOn ? 'bg-purple-600/10 border-purple-500/30 text-purple-400' : 'bg-white/5 border-white/5 text-gray-500'}`}
              >
                {isCamOn ? <VideoIcon className="w-6 h-6 mb-2" /> : <VideoOff className="w-6 h-6 mb-2" />}
                <span className="text-[10px] font-black uppercase tracking-widest">Cam {isCamOn ? 'On' : 'Off'}</span>
              </button>
            </div>

            <div className="h-48 rounded-2xl overflow-hidden glass border border-white/5 bg-black/40 relative">
              {isCamOn && localChatStream ? (
                <video autoPlay muted playsInline ref={v => { if (v) v.srcObject = localChatStream; }} className="w-full h-full object-cover scale-x-[-1]" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center opacity-30">
                  <VideoOff className="w-8 h-8 mb-2" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Camera Disabled</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-[#020202] text-white overflow-hidden p-4 md:p-6 gap-6 selection:bg-purple-500/30">
      <div className="flex-1 flex flex-col min-h-0 space-y-4 md:space-y-6">
        <div className="flex shrink-0 items-center justify-between glass p-4 rounded-2xl border border-white/5 shadow-lg">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Video className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">CineTogether</h1>
              <span className="text-[10px] text-purple-400/80 font-black tracking-[0.2em] uppercase">Platinum Edition</span>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex -space-x-2 mr-4">
              {connectedUsers.map((u, i) => (
                <div key={u.userId} title={u.userName} className={`w-8 h-8 rounded-full border-2 border-black bg-purple-600 flex items-center justify-center text-[10px] font-bold z-[${i}]`}>
                  {u.userName.charAt(0)}
                </div>
              ))}
            </div>
            <button onClick={() => navigator.clipboard.writeText(roomId).then(() => alert("ID Copied"))} className="btn-glass px-4 py-2 rounded-xl flex items-center space-x-2 text-sm hover:scale-105 active:scale-95 transition-all">
              <Share2 className="w-4 h-4 text-purple-400" />
              <span>Invite</span>
            </button>
            <button onClick={() => window.location.href = "/"} className="btn-glass px-4 py-2 text-red-400 rounded-xl flex items-center space-x-2 text-sm font-bold hover:bg-red-500/20 transition-all">
              <LogOut className="w-4 h-4" />
              <span>Leave</span>
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center relative min-h-0 bg-black/40 rounded-[2.5rem] overflow-hidden glass border border-white/5 shadow-2xl group/theatre">
          {(stream || externalUrl) ? (
            <div className="w-full h-full relative">
              {externalUrl ? (
                <div className="w-full h-full bg-black flex flex-col">
                  <iframe 
                    src={externalUrl.includes('youtube.com') ? externalUrl.replace('watch?v=', 'embed/') : externalUrl} 
                    className="w-full h-full border-0"
                    allow="autoplay; encrypted-media; fullscreen"
                  />
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center space-x-4 py-3 px-6 glass rounded-2xl border border-white/10 opacity-0 group-hover/theatre:opacity-100 transition-opacity z-10 shadow-2xl">
                    <button onClick={toggleMic} className={`p-3 rounded-xl transition-all ${isMicOn ? 'bg-purple-600 shadow-lg border border-purple-400' : 'bg-red-600/20 text-red-500 border border-red-500/30'}`}>
                      {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                    </button>
                    <button onClick={toggleCam} className={`p-3 rounded-xl transition-all ${isCamOn ? 'bg-purple-600 shadow-lg border border-purple-400' : 'bg-red-600/20 text-red-500 border border-red-500/30'}`}>
                      {isCamOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                    </button>
                    <button onClick={() => setExternalUrl(null)} className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all">
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                <VideoPlayer 
                  ref={videoPlayerRef}
                  stream={stream} 
                  isMicOn={isMicOn}
                  isCamOn={isCamOn}
                  onToggleMic={toggleMic}
                  onToggleCam={toggleCam}
                  onAction={(type, time) => {
                    socket?.emit("sync-playback", { roomId, type, time });
                  }}
                />
              )}
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 space-y-8 animate-in fade-in zoom-in duration-1000">
              <div className="text-center space-y-4 max-w-xl">
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-black uppercase tracking-[0.3em]">
                  <Globe className="w-3 h-3" />
                  <span>Choose Your Experience</span>
                </div>
                <h2 className="text-5xl font-black text-white tracking-tighter leading-none mb-2">Cinema Reimagined.</h2>
                <p className="text-gray-400 text-lg font-medium">Join instantly, watch together in 8Mbps UHD quality.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-4xl px-4">
                <label className="group/card relative flex flex-col items-center p-10 bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-purple-500/50 rounded-[3rem] transition-all cursor-pointer shadow-xl">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-6 group-hover/card:scale-125 transition-transform duration-500 ease-out shadow-lg shadow-purple-500/10">
                    <FileVideo className="w-8 h-8 text-purple-500" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Local Master</h3>
                  <p className="text-[10px] text-gray-500 text-center uppercase tracking-[0.2em] font-black opacity-60">High-Fidelity P2P 💎</p>
                  <input type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />
                </label>

                <div 
                  onClick={handleScreenShare}
                  className="group/card relative flex flex-col items-center p-10 bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-yellow-500/50 rounded-[3rem] transition-all cursor-pointer shadow-xl"
                >
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center mb-6 group-hover/card:scale-125 transition-transform duration-500 ease-out shadow-lg shadow-yellow-500/10">
                    <Monitor className="w-8 h-8 text-yellow-500" />
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-center">Screen Share</h3>
                  <p className="text-[10px] text-gray-500 text-center uppercase tracking-[0.2em] font-black opacity-60">Hotstar / Netflix 🍿</p>
                </div>

                <div className="group/card relative flex flex-col items-center p-10 bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-pink-500/50 rounded-[3rem] transition-all shadow-xl">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500/20 to-orange-500/20 flex items-center justify-center mb-6 group-hover/card:scale-125 transition-transform duration-500 ease-out shadow-lg shadow-pink-500/10">
                    <Globe className="w-8 h-8 text-pink-500" />
                  </div>
                  <h3 className="text-xl font-bold mb-4">Web Stream</h3>
                  <form onSubmit={handleLinkSubmit} className="w-full flex relative">
                    <input 
                      type="text" 
                      placeholder="Paste link here..." 
                      value={linkInput}
                      onChange={(e) => setLinkInput(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-pink-500/50 transition-all font-medium"
                    />
                    <button type="submit" className="absolute right-2 top-2 bottom-2 bg-pink-600 hover:bg-pink-700 px-4 rounded-xl transition-all active:scale-90 flex items-center justify-center shadow-lg shadow-pink-500/20">
                      <Share2 className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>

              <div className="flex items-center space-x-8 py-6 px-14 glass rounded-full border border-white/10 shadow-2xl animate-in slide-in-from-bottom duration-1000">
                <div className="flex flex-col items-center">
                   <button onClick={toggleMic} className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${isMicOn ? 'bg-purple-600 shadow-xl border border-purple-400' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30'}`}>
                    {isMicOn ? <Mic className="w-7 h-7" /> : <MicOff className="w-7 h-7" />}
                  </button>
                  <span className="text-[9px] mt-2 font-black text-gray-400 uppercase tracking-widest leading-none">Voice</span>
                </div>
                <div className="flex flex-col items-center">
                  <button onClick={toggleCam} className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${isCamOn ? 'bg-purple-600 shadow-xl border border-purple-400' : 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30'}`}>
                    {isCamOn ? <VideoIcon className="w-7 h-7" /> : <VideoOff className="w-7 h-7" />}
                  </button>
                  <span className="text-[9px] mt-2 font-black text-gray-400 uppercase tracking-widest leading-none">Camera</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 w-full lg:w-[28rem] h-1/3 lg:h-full flex flex-col min-h-0 space-y-6">
        <div className="h-full flex flex-col space-y-6">
          <div className="grid grid-cols-2 gap-4 h-48 sm:h-56">
            <div className="relative rounded-3xl overflow-hidden glass border border-white/10 bg-black/40 group/cam shadow-2xl ring-1 ring-white/5">
              {isCamOn && localChatStream ? (
                <video autoPlay muted playsInline ref={v => { if (v) v.srcObject = localChatStream; }} className="w-full h-full object-cover scale-x-[-1]" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                    <VideoOff className="w-5 h-5 text-gray-600" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Cam Off</span>
                </div>
              )}
              <div className="absolute top-3 left-3 px-3 py-1 bg-black/60 rounded-full text-[9px] font-black tracking-widest uppercase border border-white/10 backdrop-blur-md">You</div>
              {!isMicOn && (
                <div className="absolute top-3 right-3 p-1.5 bg-red-600/80 rounded-lg backdrop-blur-md shadow-lg border border-red-500/30">
                  <MicOff className="w-3 h-3 text-white" />
                </div>
              )}
            </div>

            <div className="relative rounded-3xl overflow-hidden glass border border-white/10 bg-black/40 group/cam shadow-2xl ring-1 ring-white/5">
              {remoteChatStream ? (
                <video autoPlay playsInline ref={v => { if (v) v.srcObject = remoteChatStream; }} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center space-y-2">
                  <div className="w-14 h-14 rounded-full bg-purple-500/5 flex items-center justify-center animate-pulse">
                    <Globe className="w-6 h-6 text-purple-600/40" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest animate-pulse">Searching...</span>
                </div>
              )}
              <div className="absolute top-3 left-3 px-3 py-1 bg-purple-600/60 rounded-full text-[9px] font-black tracking-widest uppercase border border-white/10 backdrop-blur-md">
                {connectedUsers.find(u => u.userId !== userId)?.userName || 'Partner'}
              </div>
            </div>
          </div>
          
          <div className="flex-1 min-h-0 min-w-0 glass rounded-[2rem] border border-white/5 overflow-hidden shadow-2xl">
             <ChatSidebar messages={messages} currentUserId={userId} onSendMessage={(text) => socket?.emit("chat-message", { roomId, userId, userName, message: text })} />
          </div>
        </div>
      </div>
    </div>
  );
}
