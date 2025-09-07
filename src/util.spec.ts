import { parseTime } from './util';

describe('parseTime', () => {
  it('should return a Date object for a valid numeric timestamp string', () => {
    const timestamp = '1678886400000'; // March 15, 2023 12:00:00 AM GMT
    const expectedDate = new Date(1678886400000);
    expect(parseTime(timestamp)).toEqual(expectedDate);
  });

  it('should return a Date object for a valid numeric timestamp', () => {
    const timestamp = 1678886400000; // March 15, 2023 12:00:00 AM GMT
    const expectedDate = new Date(1678886400000);
    expect(parseTime(timestamp)).toEqual(expectedDate);
  });

  it('should return null for an invalid timestamp string', () => {
    const timestamp = 'not-a-timestamp';
    expect(parseTime(timestamp)).toBeNull();
  });

  it('should return null for an empty string', () => {
    const timestamp = '';
    expect(parseTime(timestamp)).toBeNull();
  });

  it('should return null for a non-numeric string that could be parsed as 0', () => {
    const timestamp = 'abc';
    expect(parseTime(timestamp)).toBeNull();
  });
});
