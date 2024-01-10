import { ethers } from 'hardhat'
import { LogConsole } from './shared/logconsol'
import { hexToBytes32, bytes32ToHex, uuid } from './shared/fixtures'

let res: any

describe('Util', async () => {
    
  before('create fixture loader', async () => {
    LogConsole.debug('before');
  })

  beforeEach('deploy instance', async () => {
    LogConsole.debug('beforeEach');
  })

  afterEach('clean case', async () => {
    LogConsole.debug('afterEach');
  })

  it('bytes32', async () => {
    res = hexToBytes32('0x');
    LogConsole.info(res);
    res = hexToBytes32('0x1');
    LogConsole.info(res);
    res = hexToBytes32('0x0000000000000000000000000000000000000000000000000000000000000001');
    LogConsole.info(res);
    res = bytes32ToHex('0x0000000000000000000000000000000000000000000000000000000000000001');
    LogConsole.info(res);
    res = uuid();
    LogConsole.info(res);
    res = hexToBytes32(res);
    LogConsole.info(res);
    res = bytes32ToHex(res);
    LogConsole.info(res);
  });

})