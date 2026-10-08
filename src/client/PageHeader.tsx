import type { ReactNode, Ref } from "react";
import { FileText, Folder } from "lucide-react";

/** Home-relative paths, as a shell prints them. */
export const home = (path: string) => path.replace(/^\/home\/[^/]+/, "~");

/** A file (or folder) this page reads or writes. */
export function FilePath({ path, folder = false }: { path: string; folder?: boolean }) {
  const Icon = folder ? Folder : FileText;
  return <span className="file-path" title={path}><Icon aria-hidden="true" /><code translate="no">{home(path)}</code></span>;
}

/** What the page edits, in which files, and the page's own actions. */
export function PageHeader({ title, titleRef, description, files = [], actions }: {
  title: string; titleRef?: Ref<HTMLHeadingElement>; description: ReactNode; files?: (string | undefined)[]; actions?: ReactNode;
}) {
  const paths = files.filter((path): path is string => !!path);
  return <header className="page-header">
    <div>
      <h1 ref={titleRef} tabIndex={titleRef ? -1 : undefined}>{title}</h1>
      <p>{description}</p>
      {paths.length > 0 && <div className="file-paths">{paths.map(path => <FilePath key={path} path={path} />)}</div>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>;
}
