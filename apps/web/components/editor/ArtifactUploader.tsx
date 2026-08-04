'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { uploadArtifact, type ArtifactReference } from '../../lib/api';

/** 附件上传（P1B-3 管线，multipart）。 */
export default function ArtifactUploader({
  workspaceId,
  artifacts,
  onArtifactsChange,
}: {
  workspaceId: string;
  artifacts: ArtifactReference[];
  onArtifactsChange: (artifacts: ArtifactReference[]) => void;
}) {
  const t = useTranslations('editor');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const logicalPath = file.name;
      const res = await uploadArtifact(workspaceId, logicalPath, file);
      onArtifactsChange([...artifacts, { logicalPath, artifactId: res.artifact.artifactId }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div>
      <h3 className="pane-title" style={{ marginTop: 24 }}>{t('artifacts')}</h3>
      <input
        ref={fileRef}
        type="file"
        data-testid="artifact-input"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
        aria-label={t('uploadArtifact')}
      />
      {uploading && <p className="pane-meta">…</p>}
      {error && <p className="error-panel" style={{ marginTop: 8 }}>{error}</p>}
      <div className="artifact-list">
        {artifacts.map((a) => (
          <div key={a.artifactId} className="artifact-item">{a.logicalPath}</div>
        ))}
      </div>
    </div>
  );
}
