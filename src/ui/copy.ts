export const COPY = {
  title: '파동의 간섭',
  wave: '파동 모습',
  amplitude: '간섭무늬',
  play: '재생',
  pause: '일시 정지',
  reset: '처음으로',
  comparison: '경로 펼치기',
  collapse: '경로 접기',
  wavelength: '파장',
  separation: '파원 간격',
  hint: '관측할 곳을 눌러 보세요.',
  constructive: '보강 간섭',
  destructive: '상쇄 간섭',
  intermediate: 'P에서의 간섭',
  cancellation: '두 파의 합은 진동하지 않아요.',
  waveLegend: '순간 변위',
  amplitudeLegend: '합성 진폭',
} as const;

export const comparisonCopy = {
  sourceNames: ['파원 1', '파원 2'],
  sum: '두 파의 합',
  probeTitle: 'P에서의 진동',
  pathDifference: '경로차',
  equalDistance: '같은 거리',
  zero: '0',
  displacement: '변위',
} as const;

/** Convert SI lengths only at the display boundary. */
export function formatDistance(meters: number): string {
  return `${(meters * 100).toFixed(1)} cm`;
}

export function formatAmplitude(meters: number): string {
  return meters > 0 && meters < .001 ? '0.1 cm 미만' : formatDistance(meters);
}
