import React, { useRef } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '../../../../../utils/cn';
import { UVTT_ACCEPT } from '../../../../import/uvtt/uvttFileNames';
import { VIDEO_MAP_ACCEPT } from '../../../../pixi/mapImage/video/videoMapFiles';

interface UploadDropzoneProps {
  title: string;
  hint: string;
  multiple: boolean;
  /** Offers Universal VTT map files and videos (animated maps) beside images. */
  acceptsMapFiles?: boolean;
  isDragging: boolean;
  onFiles: (files: File[]) => void;
}

/** Click-or-drop file picker in the rail. Drag state is owned by the window so drops anywhere count. */
export function UploadDropzone({ title, hint, multiple, acceptsMapFiles = false, isDragging, onFiles }: UploadDropzoneProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = (): void => inputRef.current?.click();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files?.length) onFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  return (
    <div
      className={cn('atlas-token-creator__dropzone', isDragging && 'atlas-dragging')}
      role="button"
      tabIndex={0}
      onClick={openPicker}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
    >
      <div className="atlas-token-creator__dropzone-icon"><Upload /></div>
      <span className="atlas-token-creator__dropzone-title">{title}</span>
      <span className="atlas-token-creator__dropzone-hint">{hint}</span>
      <span className="atlas-token-creator__dropzone-formats">{acceptsMapFiles ? 'PNG · JPG · WebP · Universal VTT · WebM · MP4' : 'PNG · JPG · WebP'}</span>
      <input ref={inputRef} type="file" accept={acceptsMapFiles ? `image/*,${UVTT_ACCEPT},${VIDEO_MAP_ACCEPT}` : 'image/*'} multiple={multiple} onChange={handleChange} />
    </div>
  );
}
