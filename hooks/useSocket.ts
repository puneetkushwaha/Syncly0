import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export const useSocket = (roomId: string, userId: string, userName?: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Determine the signaling URL from environment variables
    const serverUrl = process.env.NEXT_PUBLIC_SIGNALING_SERVER || 'http://localhost:3010';

    let timeoutId: NodeJS.Timeout;
    let localSocket: Socket | null = null;
    let isCleanup = false;

    // Small delay to prevent React Strict Mode race conditions
    timeoutId = setTimeout(() => {
      if (isCleanup) return;
      
      console.log('Attempting to connect to signaling server...');
      localSocket = io(serverUrl, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        timeout: 10000,
        forceNew: true,
      });
      
      localSocket.on('connect', () => {
        console.log('Successfully connected to signaling server!');
        if (userName) {
          localSocket?.emit('join-room', { roomId, userId, userName });
        }
      });

      localSocket.on('connect_error', (err) => {
        console.error('Socket connection error:', err.message);
      });

      setSocket(localSocket);
    }, 200);

    return () => {
      isCleanup = true;
      clearTimeout(timeoutId);
      if (localSocket) {
        localSocket.removeAllListeners();
        localSocket.disconnect();
        setSocket(null);
      }
    };
  }, [roomId, userId, userName]);

  return socket;
};
