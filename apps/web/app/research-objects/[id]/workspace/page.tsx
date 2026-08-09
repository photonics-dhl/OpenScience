import WorkspaceOverview from '../../../../components/workspace/WorkspaceOverview';

export default function WorkspaceOverviewPage({ params }: { params: { id: string } }) {
  return <WorkspaceOverview roId={params.id} />;
}
