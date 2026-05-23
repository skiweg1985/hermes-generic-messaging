interface AudioPlayerProps {
  url: string;
  mimeType?: string;
}

export function AudioPlayer({ url, mimeType }: AudioPlayerProps) {
  if (!url) return null;
  return (
    <div className="audio-inline">
      <audio controls preload="none" src={url}>
        <source src={url} type={mimeType} />
      </audio>
    </div>
  );
}
