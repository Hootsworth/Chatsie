import React from 'react';
import { GridLayout, ParticipantTile, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';

export const VideoGrid: React.FC = () => {
  // Fetch all camera and screenshare tracks (both local and remote)
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  // Filter out the local participant's screenshare to prevent the infinite mirror effect
  const filteredTracks = tracks.filter(
    (t) => !(t.source === Track.Source.ScreenShare && t.participant.isLocal)
  );

  return (
    <div className="w-full h-full p-4 relative">
      <GridLayout tracks={filteredTracks} style={{ height: '100%', width: '100%' }}>
        <ParticipantTile />
      </GridLayout>
    </div>
  );
};

export default VideoGrid;
