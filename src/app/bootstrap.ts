import '../styles.css';
import { createAppSession } from './session';
import { showFailure } from '../ui/failure';

const root = document.querySelector<HTMLElement>('#app')!;
const session = createAppSession();
let startup = true, failed = false, disposed = false;
function fail(error: unknown, source: string) {
  if (failed || disposed) return;
  failed = true;
  session.record(source, error);
  // Capture the experiment before teardown removes its rendering resources.
  const experiment = session.snapshot();
  session.dispose();
  detach();
  console.error('Simulation stopped.', error);
  showFailure(root, startup, JSON.stringify({
    format: 1,
    build: new URL(import.meta.url).pathname,
    environment: import.meta.env.MODE,
    browser: navigator.userAgent,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    experiment,
    events: session.events(),
  }, null, 2));
}
function onError(event: ErrorEvent) {
  // Resource loading events and browser ResizeObserver notifications are not app exceptions.
  if (event.error || event.filename) fail(event.error ?? event.message, 'uncaught-error');
}
function onRejection(event: PromiseRejectionEvent) { fail(event.reason, 'unhandled-rejection'); }
function detach() {
  window.removeEventListener('error', onError);
  window.removeEventListener('unhandledrejection', onRejection);
}
window.addEventListener('error', onError);
window.addEventListener('unhandledrejection', onRejection);
// A query route also survives a direct refresh on static hosts such as Pages.
const appModule = new URLSearchParams(location.search).get('mode') === 'teacher'
  ? import('./teacher')
  : import('./main');
appModule.then(({ mountApp }) => {
  if (failed || disposed) return;
  mountApp(root, session);
  startup = false;
}).catch(error => fail(error, 'startup-failed'));

if (import.meta.hot) {
  import.meta.hot.accept('./main', () => location.reload());
  import.meta.hot.accept('./teacher', () => location.reload());
  import.meta.hot.dispose(() => { disposed = true; detach(); session.dispose(); });
}
