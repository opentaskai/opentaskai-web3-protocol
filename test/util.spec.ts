import { ethers } from 'hardhat'
import { LogConsole } from './shared/logconsol'

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
    res = ethers.utils.hexZeroPad('0x', 32);
    LogConsole.info(res);
  });

})