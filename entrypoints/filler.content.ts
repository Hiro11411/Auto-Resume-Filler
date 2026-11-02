import { ATS_MATCHES } from '../src/ext/hosts';
import { startContent } from '../src/ext/content-main';

export default defineContentScript({
  matches: ATS_MATCHES,
  allFrames: true,
  runAt: 'document_idle',
  main() {
    void startContent();
  },
});
