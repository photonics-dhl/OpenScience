/** A mounted product action offered to the current Hermes conversation. */
export interface HermesConversationAction {
  kind: 'production' | 'publication' | 'media-review';
  ready: boolean;
  canDismiss: boolean;
  confirm(message?: string): Promise<void>;
  resumeEditing?(): Promise<void>;
}
