import type { ModelState, PhysicsSnapshot, ViewState } from '../model/types';
import { sourceSeparation } from '../model/state';
import type { AppShell } from './shell';
import { COPY, formatDistance as cm, formatAmplitude, formatSettingDistance } from './copy';
import { PLAYBACK_RATES } from '../model/playback';

/** Presentation only: consumes input/display snapshots and never issues engine commands. */
export function createObservationPanel({ controls, outputs }: AppShell) {
  return {
    controls(model: ModelState, view: ViewState, previewSeparation: number | null) {
      controls.play.textContent = view.playing ? `Ⅱ ${COPY.pause}` : `▶ ${COPY.play}`;
      controls.play.setAttribute('aria-label', view.playing ? COPY.pause : COPY.play);
      controls.playbackRate.value = String(PLAYBACK_RATES.indexOf(view.playbackRate));
      controls.playbackRate.setAttribute('aria-valuetext', `${view.playbackRate}배속`);
      outputs.playbackRate.value = `${view.playbackRate}×`;
      controls.comparison.setAttribute('aria-expanded', String(view.comparisonOpen));
      controls.changeProcess.setAttribute('aria-pressed', String(view.changeMode === 'instant'));
      controls.pathWaves.setAttribute('aria-pressed', String(view.pathWaves));
      controls.comparison.querySelector('[data-label]')!.textContent = view.comparisonOpen ? COPY.collapse : COPY.comparison;
      controls.wave.setAttribute('aria-pressed', String(view.fieldMode === 'wave'));
      controls.amplitude.setAttribute('aria-pressed', String(view.fieldMode === 'amplitude'));
      controls.wavelength.value = String(model.wavelength * 100);
      const separation = previewSeparation ?? sourceSeparation(model);
      controls.separation.value = String(separation * 100);
      outputs.wavelength.value = formatSettingDistance(model.wavelength);
      outputs.separation.value = formatSettingDistance(separation);
      controls.wavelength.setAttribute('aria-valuetext', outputs.wavelength.value);
      controls.separation.setAttribute('aria-valuetext', outputs.separation.value);
    },
    readouts(snapshot: PhysicsSnapshot, view: ViewState, hasPreview: boolean, showProbeBounds: boolean) {
      const { probe, steady, moving } = snapshot;
      outputs.distance1.textContent = cm(probe.distances[0]);
      outputs.distance2.textContent = cm(probe.distances[1]);
      outputs.pathDifference.textContent = cm(Math.abs(probe.signedPathDifference));
      const ratio = Math.abs(probe.signedPathDifference) / snapshot.model.wavelength;
      outputs.ratio.textContent = steady ? `${ratio.toFixed(2)}λ` : '—';
      outputs.condition.textContent = probe.interference === 'transient' ? '새 조건이 P에 도착하는 중'
        : probe.interference === 'destructive' ? `반대 위상 · ${COPY.cancellation}`
        : probe.interference === 'constructive' ? '같은 위상 · 보강 간섭'
        : `합성 진폭 ${formatAmplitude(probe.resultantAmplitude!)}`;
      outputs.hint.hidden = showProbeBounds || view.interacted || hasPreview || moving || !steady;
      outputs.probeHint.setAttribute('aria-hidden', String(!showProbeBounds));
      outputs.motionHint.textContent = view.changeMode === 'instant' ? (hasPreview ? '손을 떼면 이 위치로 확정해요.' : '')
        : hasPreview ? '손을 떼면 점선 위치로 이동해요.'
        : moving && !view.playing ? '재생하면 점선 위치로 이동해요.'
        : moving ? '파원이 점선 위치로 이동하고 있어요.'
        : !steady ? '새 조건의 파동이 퍼지고 있어요.' : '';
      outputs.motionHint.hidden = outputs.motionHint.textContent === '';
      outputs.fieldStatus.textContent = view.fieldMode === 'amplitude' && !steady ? '변화 중 · 도착 위상으로 본 간섭무늬' : '';
      outputs.fieldStatus.hidden = outputs.fieldStatus.textContent === '';
    },
    announce({ probe }: PhysicsSnapshot) {
      outputs.announcement.textContent = `P까지 파원 1 ${cm(probe.distances[0])}, 파원 2 ${cm(probe.distances[1])}. 경로차 ${cm(Math.abs(probe.signedPathDifference))}. ${outputs.condition.textContent}`;
    },
  };
}
