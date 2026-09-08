'use client';

import { useTranslations } from 'next-intl';
import type { ArtifactReference } from '../../lib/api';
import type { ConflictChoice, CoreConflict } from '../../lib/editor-state';

const KNOWN_FIELDS = new Set(['problem', 'insight', 'method', 'results', 'limitations', 'reproducibility']);

export interface EditorConflict extends CoreConflict {
  operation: 'save' | 'commit';
  localArtifacts: ArtifactReference[];
  serverArtifacts: ArtifactReference[];
  artifactsDiffer: boolean;
  artifactChoice?: ConflictChoice;
}

export default function ConflictResolutionPanel({
  conflict,
  onChooseField,
  onChooseArtifacts,
  onResolve,
  ready,
}: {
  conflict: EditorConflict;
  onChooseField: (field: string, choice: ConflictChoice) => void;
  onChooseArtifacts: (choice: ConflictChoice) => void;
  onResolve: () => void;
  ready: boolean;
}) {
  const t = useTranslations('editor');
  const conflictT = useTranslations('editor.conflict');
  const value = (side: 'localCore' | 'serverCore', field: string) => (
    (conflict[side] as unknown as Record<string, string | undefined>)[field] ?? conflictT('empty')
  );
  const fieldLabel = (field: string) => KNOWN_FIELDS.has(field) ? t(field) : field;
  const artifactText = (items: ArtifactReference[]) => items.length
    ? items.map((item) => `${item.logicalPath} · ${item.artifactId}`).join('\n')
    : conflictT('noMaterials');

  return (
    <section className="mb-6 border border-os-vermilion bg-os-black-1 p-4 text-os-paper sm:p-5" aria-labelledby="editor-conflict-title" role="alert">
      <p className="m-0 font-data text-xs uppercase tracking-[0.12em] text-os-vermilion-ink">{conflictT('kicker')}</p>
      <h2 className="mb-0 mt-2 font-editorial text-2xl font-normal" id="editor-conflict-title">{conflictT('title')}</h2>
      <p className="mb-0 mt-2 max-w-3xl text-sm leading-6 text-os-muted-paper">{conflictT('body', { version: conflict.serverVersion })}</p>

      <div className="mt-5 space-y-5">
        {conflict.fields.map((field) => (
          <fieldset className="min-w-0 border-t border-os-rule-dark pt-4" key={field}>
            <legend className="pr-3 font-semibold">{fieldLabel(field)}</legend>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
              {(['mine', 'server'] as const).map((choice) => (
                <label className={`min-w-0 cursor-pointer border p-3 ${conflict.choices[field] === choice ? 'border-os-vermilion bg-os-black-2' : 'border-os-rule-dark'}`} key={choice}>
                  <span className="flex min-h-6 items-center gap-2 font-semibold">
                    <input checked={conflict.choices[field] === choice} name={`conflict-${field}`} onChange={() => onChooseField(field, choice)} type="radio" />
                    {choice === 'mine' ? conflictT('mine') : conflictT('server')}
                  </span>
                  <span className="mt-2 block max-h-40 overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-os-muted-paper">{value(choice === 'mine' ? 'localCore' : 'serverCore', field)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}

        {conflict.operation === 'commit' && conflict.artifactsDiffer ? (
          <fieldset className="min-w-0 border-t border-os-rule-dark pt-4">
            <legend className="pr-3 font-semibold">{conflictT('materials')}</legend>
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
              {(['mine', 'server'] as const).map((choice) => (
                <label className={`min-w-0 cursor-pointer border p-3 ${conflict.artifactChoice === choice ? 'border-os-vermilion bg-os-black-2' : 'border-os-rule-dark'}`} key={choice}>
                  <span className="flex min-h-6 items-center gap-2 font-semibold">
                    <input checked={conflict.artifactChoice === choice} name="conflict-materials" onChange={() => onChooseArtifacts(choice)} type="radio" />
                    {choice === 'mine' ? conflictT('mine') : conflictT('server')}
                  </span>
                  <span className="mt-2 block max-h-40 overflow-auto whitespace-pre-wrap break-all font-data text-xs leading-5 text-os-muted-paper">{artifactText(choice === 'mine' ? conflict.localArtifacts : conflict.serverArtifacts)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-os-rule-dark pt-4">
        <button className="min-h-11 rounded-panel bg-os-vermilion px-4 font-semibold text-os-black-0 disabled:cursor-not-allowed disabled:opacity-40" disabled={!ready} onClick={onResolve} type="button">{conflictT('apply')}</button>
        <span className="text-sm text-os-muted-paper" aria-live="polite">{ready ? conflictT('ready') : conflictT('chooseAll')}</span>
      </div>
    </section>
  );
}
