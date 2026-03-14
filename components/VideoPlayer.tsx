"use client";

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import { Play, Pause, Maximize, Volume2, Maximize2, SkipForward, SkipBack, VolumeX, Mic, MicOff, Video as VideoIcon, VideoOff } from "lucide-react";

interface VideoPlayerProps {
  stream?: MediaStream | null;
  onAction?: (type: string, time: number) => void;
  isMicOn?: boolean;
  isCamOn?: boolean;
  onToggleMic?: () => void;
  onToggleCam?: () => void;
}

export interface VideoPlayerRef {
  syncPlay: (time: number) => void;
  syncPause: (time: number) => void;
  syncSeek: (time: number) => void;
}

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({ 
  stream, 
  onAction, 
  isMicOn, 
  isCamOn, 
  onToggleMic, 
  onToggleCam 
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(true); // Default to muted for stable autoplay
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        console.log(`Setting new stream object. Tracks:`, stream.getTracks().map(t => t.kind));
        videoRef.current.srcObject = stream;
        
        // Only force mute if we haven't unmuted yet, to satisfy autoplay.
        // If the user already interacted with volume/mute, respect their setting.
        videoRef.current.muted = isMuted; 
        
        videoRef.current.play().catch(err => {
          if (err.name !== 'AbortError') {
            console.warn("Autoplay blocked or failed:", err);
            // Fallback: force mute if blocked
            if (videoRef.current) {
              videoRef.current.muted = true;
              setIsMuted(true);
              videoRef.current.play().catch(() => {});
            }
          }
        });
      }
    }
  }, [stream, isMuted]);

  // Auto-hide controls
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  useImperativeHandle(ref, () => ({
    syncPlay: (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
        videoRef.current.play();
        setIsPlaying(true);
      }
    },
    syncPause: (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
        videoRef.current.pause();
        setIsPlaying(false);
      }
    },
    syncSeek: (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    }
  }));

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
      onAction?.("play", videoRef.current.currentTime);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
      onAction?.("pause", videoRef.current.currentTime);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const p = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(p || 0);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * videoRef.current.duration;
    videoRef.current.currentTime = newTime;
    onAction?.("seek", newTime);
  };

  const toggleFullScreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      setIsMuted(val === 0);
      videoRef.current.muted = val === 0;
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const newMute = !isMuted;
    setIsMuted(newMute);
    videoRef.current.muted = newMute;
    if (!newMute && volume === 0) {
      setVolume(0.5);
      videoRef.current.volume = 0.5;
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        const v = Math.min(1, volume + 0.1);
        setVolume(v);
        if (videoRef.current) {
          videoRef.current.volume = v;
          setIsMuted(v === 0);
          videoRef.current.muted = v === 0;
        }
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        const v = Math.max(0, volume - 0.1);
        setVolume(v);
        if (videoRef.current) {
          videoRef.current.volume = v;
          setIsMuted(v === 0);
          videoRef.current.muted = v === 0;
        }
      } else if (e.key.toLowerCase() === 'm') {
        toggleMute(e as any);
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullScreen(e as any);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [volume, isPlaying, isMuted]);

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-full bg-black flex group overflow-hidden"
      onMouseMove={handleMouseMove}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        onTimeUpdate={handleTimeUpdate}
        className="w-full h-full object-contain pointer-events-none"
        autoPlay
        playsInline
        muted={isMuted} // Bind directly to state
      />
      
      {/* Controls Overlay */}
      <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent transition-opacity duration-500 flex flex-col justify-end p-4 md:p-8 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        {/* Progress Bar */}
        <div 
          className="w-full h-2 bg-white/10 rounded-full mb-8 cursor-pointer overflow-hidden relative group/progress"
          onClick={handleSeek}
        >
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 animate-gradient-x" 
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between pointer-events-auto">
          <div className="flex items-center space-x-6 md:space-x-8">
            <button onClick={togglePlay} className="hover:scale-125 transition-all text-white active:scale-95">
              {isPlaying ? <Pause className="w-6 h-6 md:w-8 md:h-8 fill-white" /> : <Play className="w-6 h-6 md:w-8 md:h-8 fill-white" />}
            </button>

            <div className="flex items-center space-x-3 group/volume">
              <button onClick={toggleMute} className="text-white hover:text-purple-400 transition-colors">
                {isMuted ? <VolumeX className="w-5 h-5 md:w-6 md:h-6 text-pink-500" /> : <Volume2 className="w-5 h-5 md:w-6 md:h-6" />}
              </button>
              <input 
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                onClick={(e) => e.stopPropagation()}
                className="w-20 md:w-32 h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-purple-500"
              />
            </div>

            <div className="h-8 w-px bg-white/10 hidden sm:block" />

            {/* Mic & Cam Toggles */}
            <div className="flex items-center space-x-4">
              <button 
                onClick={(e) => { e.stopPropagation(); onToggleMic?.(); }}
                className={`p-2.5 rounded-full transition-all flex items-center justify-center ${isMicOn ? 'bg-purple-500/20 text-purple-400' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
              >
                {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onToggleCam?.(); }}
                className={`p-2.5 rounded-full transition-all flex items-center justify-center ${isCamOn ? 'bg-purple-500/20 text-purple-400' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
              >
                {isCamOn ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
            </div>
          </div>
          
          <button onClick={toggleFullScreen} className="text-white hover:scale-125 transition-all active:scale-90 p-2">
            <Maximize className="w-6 h-6 md:w-7 md:h-7" />
          </button>
        </div>
      </div>
    </div>
  );
});

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
