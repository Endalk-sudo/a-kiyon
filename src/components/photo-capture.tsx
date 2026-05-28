'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Upload, X, RotateCcw, SwitchCamera } from 'lucide-react';

interface PhotoCaptureProps {
  value: string | null;
  onChange: (url: string | null) => void;
  firstName?: string;
  lastName?: string;
}

export function PhotoCapture({ value, onChange, firstName = '', lastName = '' }: PhotoCaptureProps) {
  const [mode, setMode] = useState<'none' | 'camera' | 'upload'>('none');
  const [streaming, setStreaming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?';

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStreaming(true);
    } catch (err) {
      console.error('Camera error:', err);
      setMode('none');
    }
  }, [facingMode]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStreaming(false);
  }, []);

  // Switch camera facing mode
  const flipCamera = useCallback(() => {
    stopCamera();
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, [stopCamera]);

  // Start camera when mode changes to camera
  useEffect(() => {
    if (mode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [mode, startCamera, stopCamera]);

  // Capture photo from video
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Center crop to square
    const offsetX = (video.videoWidth - size) / 2;
    const offsetY = (video.videoHeight - size) / 2;
    ctx.drawImage(video, offsetX, offsetY, size, size, 0, 0, size, size);

    // Convert to blob and upload
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        await uploadBlob(blob, `capture-${Date.now()}.jpg`);
      },
      'image/jpeg',
      0.85
    );
  }, []);

  // Upload blob to server
  const uploadBlob = async (blob: Blob, filename: string) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', blob, filename);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      onChange(result.url);
      setMode('none');
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  // Handle file upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      onChange(result.url);
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Remove photo
  const removePhoto = () => {
    onChange(null);
    setMode('none');
  };

  return (
    <div className="space-y-3">
      {/* Photo Preview */}
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20 border-2 border-dashed border-muted-foreground/30">
          {value && <AvatarImage src={value} alt={`${firstName} ${lastName}`} />}
          <AvatarFallback className="text-xl bg-primary/10 text-primary font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium">Member Photo</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMode(mode === 'camera' ? 'none' : 'camera')}
              disabled={uploading}
            >
              <Camera className="h-3.5 w-3.5 mr-1.5" />
              {mode === 'camera' ? 'Close Camera' : 'Take Photo'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
            {value && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={removePhoto}
                className="text-destructive hover:text-destructive"
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Camera View */}
      {mode === 'camera' && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="relative aspect-square w-full max-w-xs mx-auto overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            {/* Hidden canvas for capture */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={flipCamera}
              disabled={!streaming}
            >
              <SwitchCamera className="h-3.5 w-3.5 mr-1.5" />
              Flip
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={capturePhoto}
              disabled={!streaming || uploading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Camera className="h-3.5 w-3.5 mr-1.5" />
              {uploading ? 'Saving...' : 'Capture'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMode('none')}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
