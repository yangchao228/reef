import { WorkspaceDirectory } from "@/components/workspace/workspace-directory";
import { getRequestWorkspaceSlug } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default function WorkspacesPage({
  searchParams,
}: {
  searchParams: { next?: string; auth?: string; create?: string };
}) {
  return (
    <WorkspaceDirectory
      authState={searchParams.auth}
      createState={searchParams.create}
      currentWorkspaceSlug={getRequestWorkspaceSlug()}
      nextPath={searchParams.next}
    />
  );
}
