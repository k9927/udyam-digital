import { Button } from '../../components/ui.jsx';

export default function NotFound() {
  return <div className="mx-auto max-w-md px-4 py-20 text-center"><p className="text-sm text-ink-muted">Page not found</p><h1 className="mt-2 text-2xl font-semibold">This page does not exist</h1><p className="mt-2 text-ink-muted">The link may be old or mistyped.</p><div className="mt-6 flex justify-center gap-2"><Button to="/" variant="secondary">Go home</Button><Button to="/advisor">Find my bundle</Button></div></div>;
}
