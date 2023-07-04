import { generateSecureRandom } from 'react-native-securerandom';

function hex(length) {
  const bytes = generateSecureRandom(length);
  return Array.from(bytes, byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
}

export default { hex }
