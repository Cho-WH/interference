/** Fatal failures replace the experiment after its resources have been stopped. */
export function showFailure(root: HTMLElement, startup: boolean, report: string) {
  root.innerHTML = `<main class="failure-screen">
    <h1 tabindex="-1">${startup ? '시뮬레이터를 시작하지 못했어요.' : '시뮬레이터가 멈췄어요.'}</h1>
    <p>새로고침하면 처음부터 다시 시작할 수 있어요.</p>
    <div class="failure-actions">
      <button class="button button-dark" type="button" data-reload>새로고침</button>
      <button class="button button-quiet" type="button" data-copy-report>오류 정보 복사</button>
    </div>
    <p class="failure-status" role="status"></p>
    <details><summary>오류 정보 보기</summary>
      <p>오류 정보는 자동으로 전송되지 않아요. 문제를 알릴 때 함께 보내 주세요.</p>
      <textarea readonly aria-label="오류 정보" spellcheck="false"></textarea>
    </details>
  </main>`;
  const details = root.querySelector('details')!;
  const textarea = root.querySelector('textarea')!;
  const status = root.querySelector<HTMLElement>('[role="status"]')!;
  const copy = root.querySelector<HTMLButtonElement>('[data-copy-report]')!;
  textarea.value = report;
  root.querySelector('[data-reload]')!.addEventListener('click', () => location.reload());
  copy.addEventListener('click', async () => {
    copy.disabled = true;
    try {
      await navigator.clipboard.writeText(report);
      status.textContent = '오류 정보를 복사했어요.';
    } catch {
      details.open = true; textarea.focus(); textarea.select();
      status.textContent = '자동 복사가 안 되면 아래 내용을 직접 복사해 주세요.';
    } finally { copy.disabled = false; }
  });
  root.querySelector<HTMLElement>('h1')!.focus();
}
