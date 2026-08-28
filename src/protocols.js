export const PROTOCOLS = {
  RESEARCH_V1: {
    id: 'RESEARCH_V1',
    label: 'Research',
    acclimationSec: 300,
    setCount: 3,
    phasesPerSet: [
      ['BASELINE',30],['QUESTION',40],['RESET',30],['QUESTION',40],['RESET',30],['QUESTION',40],['RECOVERY',30],
    ],
  },
  EVENT_V1: {
    id: 'EVENT_V1',
    label: 'Event (legacy)',
    acclimationSec: 0,
    setCount: 1,
    phasesPerSet: [
      ['BASELINE',30],['QUESTION',20],['RESET',10],['QUESTION',20],['RESET',10],['QUESTION',20],['RECOVERY',10],
    ],
  },
  EVENT_V2: {
    id: 'EVENT_V2',
    label: 'Event V2',
    acclimationSec: 0,
    setCount: 1,
    phasesPerSet: [
      ['BASELINE',30],['QUESTION',20],['RESET',10],['QUESTION',20],['RESET',10],['QUESTION',20],['RECOVERY',10],
    ],
  },
};

export const SET_ORDERS = ['ABC','ACB','BAC','BCA','CAB','CBA'];

export function buildTimeline(protocolId, setOrder, questionBankBySet) {
  const protocol = PROTOCOLS[protocolId];
  const result = [];
  let cursor = 0;
  let globalQuestionIndex = 0;
  for (let s = 0; s < protocol.setCount; s++) {
    const setId = setOrder[s] || setOrder[0] || 'A';
    let qInSet = 0;
    for (const [phase, durationSec] of protocol.phasesPerSet) {
      const item = {
        phase,
        durationSec,
        startOffsetMs: cursor,
        endOffsetMs: cursor + durationSec * 1000,
        setIndex: s,
        setId,
        questionIndex: null,
        globalQuestionIndex: null,
        questionText: null,
      };
      if (phase === 'QUESTION') {
        item.questionIndex = qInSet;
        item.globalQuestionIndex = globalQuestionIndex;
        item.questionText = questionBankBySet[setId]?.[qInSet] || '';
        qInSet += 1;
        globalQuestionIndex += 1;
      }
      result.push(item);
      cursor = item.endOffsetMs;
    }
  }
  return result;
}

export function getPhaseAtElapsed(timeline, elapsedMs) {
  return timeline.find(p => elapsedMs >= p.startOffsetMs && elapsedMs < p.endOffsetMs) || null;
}

export const isEventProtocol = protocolId => protocolId==='EVENT_V1' || protocolId==='EVENT_V2';
