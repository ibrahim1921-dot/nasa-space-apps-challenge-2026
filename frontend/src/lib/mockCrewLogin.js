// Frontend mock only. These public PINs are for trying the interface, not security.
export const MOCK_CREW = [
  { who: 'maya', name: 'Maya Okafor', role: 'Flight engineer', pin: '1234', color: '#94dedb', skin: '#875438' },
  { who: 'tomas', name: 'Tomas Reyes', role: 'Crew member', pin: '2345', color: '#a9bfff', skin: '#c68b62' },
  { who: 'lena', name: 'Lena Kowalski', role: 'Medical officer / Admin', pin: '3456', color: '#d3b2ee', skin: '#f1c6a5' },
  { who: 'kwame', name: 'Kwame Asante', role: 'Crew member', pin: '4567', color: '#eac58d', skin: '#6c422e' },
];

export const matchesMockPin = (who, pin) => MOCK_CREW.some((person) => person.who === who && person.pin === pin);
