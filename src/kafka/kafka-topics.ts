const TOPIC_MAP: Record<string, { topic: string }> = {
  '4': { topic: 'cricket-market-catalogue' },
  '1': { topic: 'soccer-market-catalogue' },
  '2': { topic: 'tennis-market-catalogue' },
  '7': { topic: 'horse-race-market-catalogue' },
  '4339': { topic: 'dog-race-market-catalogue' },

  'sr:sport:1': { topic: 'sportradar-soccer-market-catalogue' },
  'sr:sport:21': { topic: 'sportradar-cricket-market-catalogue' },
  'sr:sport:5': { topic: 'sportradar-tennis-market-catalogue' },
};
export { TOPIC_MAP };

export const ALL_KAFKA_TOPICS = Object.values(TOPIC_MAP).map(
  (entry) => entry.topic,
);

const TOPIC_BATCH_CONFIG: Record<
  string,
  { maxBatch: number; maxQueue: number }
> = {
  'cricket-market-catalogue': { maxBatch: 100, maxQueue: 400 },
  'soccer-market-catalogue': { maxBatch: 200, maxQueue: 800 },
  'tennis-market-catalogue': { maxBatch: 200, maxQueue: 800 },
  'horse-race-market-catalogue': { maxBatch: 100, maxQueue: 400 },
  'dog-race-market-catalogue': { maxBatch: 100, maxQueue: 400 },

  'sportradar-cricket-market-catalogue': {
    maxBatch: 500,
    maxQueue: 10000,
  },
  'sportradar-soccer-market-catalogue': {
    maxBatch: 500,
    maxQueue: 10000,
  },
  'sportradar-tennis-market-catalogue': {
    maxBatch: 500,
    maxQueue: 10000,
  },
};
export { TOPIC_BATCH_CONFIG };
