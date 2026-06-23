import React from 'react';
import { VideoCard } from './VideoCard';
import type { Participant } from '../../stores/meetingStore';

interface VideoGridProps {
  localStream: MediaStream | null;
  screenShareStream: MediaStream | null;
  isScreenSharing: boolean;
  remoteStreams: Map<string, MediaStream>;
  participants: Participant[];
  myUsername: string;
  isMutedAudio: boolean;
  isMutedVideo: boolean;
  isHandRaised: boolean;
  activeSpeaker: string | null;
  connectionQuality: Record<string, 'good' | 'fair' | 'poor' | 'disconnected'>;
}

export const VideoGrid: React.FC<VideoGridProps> = ({
  localStream,
  screenShareStream,
  isScreenSharing,
  remoteStreams,
  participants,
  myUsername,
  isMutedAudio,
  isMutedVideo,
  isHandRaised,
  activeSpeaker,
  connectionQuality
}) => {
  const totalCount = participants.length + 1; // local + remotes

  // Dynamically calculate grid columns based on user count for neat spacing
  const getGridClasses = () => {
    if (totalCount === 1) return 'grid-cols-1 max-w-2xl h-[70vh] items-center';
    if (totalCount === 2) return 'grid-cols-1 md:grid-cols-2 max-w-5xl h-[70vh] items-center';
    if (totalCount === 3) return 'grid-cols-1 md:grid-cols-3 max-w-6xl';
    if (totalCount === 4) return 'grid-cols-2 max-w-4xl';
    if (totalCount <= 6) return 'grid-cols-2 md:grid-cols-3 max-w-6xl';
    if (totalCount <= 9) return 'grid-cols-3 max-w-6xl';
    return 'grid-cols-2 md:grid-cols-4 max-w-7xl';
  };

  return (
    <div className="w-full flex-grow flex items-center justify-center p-4">
      <div className={`grid gap-4 w-full transition-all duration-300 ${getGridClasses()}`}>
        
        {/* Local Video Card */}
        <div className="w-full h-full min-h-[160px]">
          <VideoCard
            stream={isScreenSharing ? screenShareStream : localStream}
            username={myUsername}
            isLocal={true}
            isScreenShare={isScreenSharing}
            isMutedAudio={isMutedAudio}
            isMutedVideo={isScreenSharing ? false : isMutedVideo}
            isHandRaised={isHandRaised}
            isActiveSpeaker={activeSpeaker === 'local'}
          />
        </div>

        {/* Remote Video Cards */}
        {participants.map((p) => {
          const rStream = remoteStreams.get(p.socketId) || null;
          return (
            <div key={p.socketId} className="w-full h-full min-h-[160px]">
              <VideoCard
                stream={rStream}
                username={p.username}
                isLocal={false}
                isMutedAudio={p.isMutedAudio}
                isMutedVideo={p.isMutedVideo}
                isHandRaised={p.isHandRaised}
                isActiveSpeaker={activeSpeaker === p.socketId}
                connectionQuality={connectionQuality[p.socketId] || 'good'}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default VideoGrid;
