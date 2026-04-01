import NepaliDate from 'nepali-date-converter';

export function getTodayBS(): string {
  return new NepaliDate().format('YYYY/MM/DD');
}
