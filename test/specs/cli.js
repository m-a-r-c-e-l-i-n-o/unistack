import Fs from 'fs-extra'
import Path from 'path'
import ChildProcess from 'child_process'
import BDDStdin from '../lib/bdd-stdin.js'
import UniStackCLI from '../../src/cli.js'
import State from '../../src/cli-state.js'
import Config from '../../config.js'
import Inquirer from 'inquirer'

const unistackPath = Path.join(__dirname, '..', '..')
const unistackTmpPath = Path.join(unistackPath, 'tmp')
const unistackEnvPath = Path.join(unistackPath, 'environment')
const envPath = Config.environment.directory
const testPath = Path.join(unistackPath, 'test')
const envUnistackPath = Path.join(envPath, 'node_modules', 'unistack')
const envUnistackBootstrapPath = Path.join(envUnistackPath, 'bootstrap')

describe ('UniStackCLI', () => {
    it ('should be a function.', () => {
        expect(typeof UniStackCLI).toBe('function')
    })
})

describe ('UniStackCLI constructor()', () => {
    it ('should instantiate a cache object', () => {
        const unistack = new UniStackCLI()
        expect(typeof unistack.cache).toBe('object')
    })
})

describe ('UniStackCLI getState()', () => {
    it ('should return a state object', () => {
        const unistack = new UniStackCLI()
        expect(unistack.getState()).toEqual(State)
    })
    it ('should return a non-extendable object', () => {
        const unistack = new UniStackCLI()
        const state = unistack.getState()
        expect(() => state.hello = 'world')
        .toThrowError('Can\'t add property hello, object is not extensible')
    })
    it ('should cache state object', () => {
        const unistack = new UniStackCLI()
        const state = unistack.getState()
        expect(unistack.getState()).toBe(state)
    })
})

describe ('UniStackCLI getSystemConstants()', () => {
    it ('should return a root property with unistack\'s root path', () => {
        const unistack = new UniStackCLI()
        const system = unistack.getSystemConstants()
        expect(system.root).toBe(unistackPath)
    })
    it ('should return an property with the environment\'s root path', () => {
        const unistack = new UniStackCLI()
        const system = unistack.getSystemConstants()
        expect(system.environment.root).toBe(envPath)
    })
    it ('should return an property with the environment\'s unistack root path', () => {
        const unistack = new UniStackCLI()
        const system = unistack.getSystemConstants()
        expect(system.environment.unistack.root).toBe(envUnistackPath)
    })
    it ('should cache system object', () => {
        const unistack = new UniStackCLI()
        const system = unistack.getSystemConstants()
        expect(unistack.getSystemConstants()).toBe(system)
    })
})

describe ('UniStackCLI init()', () => {
    it ('should return a promise and handle core process exit', (done) => {
        const unistack = new UniStackCLI
        const unistackTmpPath = Path.join(unistackPath, 'tmp', 'test')
        const mockCoreInstanceFile = Path.join(unistackTmpPath, 'bin', 'core-instance.js')
        const content = `
            #!/usr/bin/env node
            process.exit(111)
        `
        unistack.cache = {
            system: {
                root: unistackTmpPath,
                environment: {
                    root: testPath
                }
            }
        }

        Fs.outputFileSync(mockCoreInstanceFile, content.trim())
        Fs.chmodSync(mockCoreInstanceFile, '0755')

        unistack.initCoreProcess = () => {
            const coreProcess = ChildProcess.fork(mockCoreInstanceFile, [])
            return Promise.resolve({ coreProcess })
        }

        spyOn(unistack, 'handleCoreProcessExitStatus')
        unistack.init().then(exitCode => {
            expect(unistack.handleCoreProcessExitStatus).toHaveBeenCalledTimes(1)
            expect(unistack.handleCoreProcessExitStatus).toHaveBeenCalledWith(exitCode)
            expect(exitCode).toBe(111)
            done()
        })
        .catch(e => console.error(e.stack))
    })
})

describe ('UniStackCLI handleCoreProcessExitStatus()', () => {
    it ('should handle unknown core process exit', () => {
        const unistack = new UniStackCLI
        const mockExitStatus = { type: 'error', data: { message: 'UNKNOWN_CORE_EXIT_CODE' }}
        unistack.handleStatus = () => {}
        expect(unistack.handleCoreProcessExitStatus()).toEqual(mockExitStatus)
    })
    it ('should handle unknown, but successful core process exit', () => {
        const unistack = new UniStackCLI
        const mockExitStatus = { type: 'success', data: { message: 'UNKNOWN_CORE_EXIT' }}
        unistack.handleStatus = () => {}
        expect(unistack.handleCoreProcessExitStatus(0)).toEqual(mockExitStatus)
    })
    it ('should handle successful core process exit', () => {
        const unistack = new UniStackCLI
        const mockExitStatus = { type: 'success', data: { message: 'CORE_EXIT' }}
        unistack.handleStatus = () => {}
        expect(unistack.handleCoreProcessExitStatus(100)).toEqual(mockExitStatus)
    })
    it ('should handle unknown erred core process exit', () => {
        const unistack = new UniStackCLI
        const mockExitStatus = { type: 'error', data: { message: 'UNKNOWN_CORE_EXIT' }}
        unistack.handleStatus = () => {}
        expect(unistack.handleCoreProcessExitStatus(1)).toEqual(mockExitStatus)
    })
    it ('should handle erred core process exit', () => {
        const unistack = new UniStackCLI
        const mockExitStatus = { type: 'error', data: { message: 'CORE_EXIT' }}
        unistack.handleStatus = () => {}
        expect(unistack.handleCoreProcessExitStatus(101)).toEqual(mockExitStatus)
    })
    it ('should call the "handleStatus" method', () => {
        const unistack = new UniStackCLI
        const mockExitStatus = { type: 'error', data: { message: 'UNKNOWN_CORE_EXIT_CODE' }}
        spyOn(unistack, 'handleStatus')
        unistack.handleCoreProcessExitStatus()
        expect(unistack.handleStatus).toHaveBeenCalledTimes(1)
        expect(unistack.handleStatus).toHaveBeenCalledWith(mockExitStatus)
    })
})

describe ('UniStackCLI initCoreProcess()', () => {
    let originalTimeout
    beforeEach(() => {
        originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000
    })
    afterEach(() => {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
    })
    it ('should start core process and open IPC channel', (done) => {
        const unistack = new UniStackCLI
        unistack.initCoreProcess().then(({ coreProcess, coreProcessIPC }) => {
            expect(coreProcessIPC).toBeDefined()
            coreProcess.destroy(done)
        })
        .catch(e => console.error(e.stack))
    })
    it ('should store the core process and ipc in the state object', (done) => {
        const unistack = new UniStackCLI()
        unistack.initCoreProcess().then(({ coreProcess, coreProcessIPC }) => {
            expect(unistack.cache.state.processes.core).toBe(coreProcess)
            expect(unistack.cache.state.messenger.core).toBe(coreProcessIPC)
            coreProcess.destroy(done)
        })
        .catch(e => console.error(e.stack))
    })
    it ('should handle status updates from the core', (done) => {
        const unistack = new UniStackCLI
        const unistackTmpPath = Path.join(unistackPath, 'tmp', 'test')
        const mockCoreInstanceFile = Path.join(unistackTmpPath, 'bin', 'core-instance.js')
        const content = `
            #!/usr/bin/env node
            var IPC = require('ipc-event-emitter').default
            var ipc = IPC(process)
            ipc.fix('core::ready')
            ipc.emit('core::status', {
                type: 'something_other_than_ready',
                data: 'nothing'
            })
        `
        unistack.cache = {
            system: {
                root: unistackTmpPath,
                environment: {
                    root: testPath
                }
            }
        }

        Fs.outputFileSync(mockCoreInstanceFile, content.trim())
        Fs.chmodSync(mockCoreInstanceFile, '0755')

        let globalCoreProcess
        unistack.handleStatus = (status) => {
            expect(status.type).toBe('something_other_than_ready')
            expect(status.data).toBe('nothing')
            expect(unistack.handleStatus).toHaveBeenCalledTimes(1)
            Fs.removeSync(mockCoreInstanceFile)
            globalCoreProcess.destroy(done)
        }
        spyOn(unistack, 'handleStatus').and.callThrough()
        unistack.initCoreProcess().then(({ coreProcess }) => {
            globalCoreProcess = coreProcess
        })
        .catch(e => console.error(e.stack))
    })
})

describe ('UniStackCLI handleStatus()', () => {
    it ('should handle unknown status updates from core', () => {
        const unistack = new UniStackCLI
        const status = {
            type: 'unknown_status',
            data: 'mystery'
        }
        unistack.statusNotFound = () => {}
        spyOn(unistack, 'statusNotFound').and.callThrough()
        unistack.handleStatus(status)
        expect(unistack.statusNotFound).toHaveBeenCalledTimes(1)
        expect(unistack.statusNotFound).toHaveBeenCalledWith(status)
    })
})

describe ('UniStackCLI statusNotFound()', () => {
    it ('should handle unknown status updates from core', () => {
        const unistack = new UniStackCLI
        const status = {
            type: 'unknown_status',
            data: 'mystery'
        }
        spyOn(unistack, 'statusNotFound').and.callThrough()
        unistack.statusNotFound(status)
        expect(unistack.statusNotFound).toHaveBeenCalledWith(status)
    })
})

describe ('UniStackCLI handleError()', () => {
    const unistack = new UniStackCLI()
    it ('should throw error when error object is present', () => {
        expect(() => unistack.handleError(new Error('Fatal!')))
        .toThrowError('Fatal!')
    })
    it ('should throw error when error string is present', () => {
        expect(() => unistack.handleError('Fatal!')).toThrowError('Fatal!')
    })
    it ('should log warning message when warning option is present', () => {
        const consoleWarn = console.warn
        console.warn = (message) => {
            expect(message).toBe('Warning!')
        }
        const warning = true
        expect(() => unistack.handleError(new Error('Warning!'), { warning }))
        .not.toThrowError()
        console.warn = consoleWarn
    })
    it ('should log warning message when error string and warning option is present', () => {
        const consoleWarn = console.warn
        console.warn = (message) => {
            expect(message).toBe('Warning!')
        }
        const warning = true
        expect(() => unistack.handleError('Warning!', { warning }))
        .not.toThrowError()
        console.warn = consoleWarn
    })
    it ('should call hook before fatal error when a hook function is provided', (done) => {
        const spy = jasmine.createSpy('spy')
        const hook = (error) => {
            spy(error)
            return false
        }
        const error = new Error('Fatal!')
        new Promise((revolve, reject) => {
            reject()
        })
        .catch(e => {
            unistack.handleError(error, { hook })
            expect(spy).toHaveBeenCalledTimes(1)
            expect(spy).toHaveBeenCalledWith(error)
            done()
        })
    })
})

describe ('UniStackCLI throwError()', () => {
    const unistack = new UniStackCLI()
    it ('should throw error', () => {
        expect(() => unistack.throwError(new Error('Fatal!')))
        .toThrowError('Fatal!')
    })
})

describe ('UniStackCLI throwAsyncError()', () => {
    const unistack = new UniStackCLI()
    it ('should throw asynchronous error', (done) => {
        const spy = jasmine.createSpy('spy')
        const error = new Error('Fatal!')
        const MockUniStack = Object.assign({}, UniStackCLI)
        unistack.throwError = (error) => {
            spy(error)
        }
        unistack.throwAsyncError(error)
        setTimeout((spy => {
            return () => {
                expect(spy).toHaveBeenCalledTimes(1)
                expect(spy).toHaveBeenCalledWith(error)
                done()
            }
        })(spy), 1)
    })
})

describe ('UniStack promptForCommand()', () => {
    it ('should prompt for command', (done) => {
        const unistack = new UniStackCLI()
        const promise = unistack.promptForCommand()
        promise.ui.rl.emit('line', 'start')
        promise.then(result => {
            expect(result).toEqual({ command: 'start' })
            done()
        })
        .catch(e => console.error(e.stack)) // catch errors in previous blocks
    })
})

describe ('UniStack validateCommand()', () => {
    it ('should return true if value is not empty', () => {
        const unistack = new UniStackCLI()
        expect(unistack.validateCommand('Hello World!')).toBe(true)
    })
    it ('should return error message if value is empty', () => {
        const unistack = new UniStackCLI()
        const errorMessage = Config.message.instruction.EMPTY_COMMAND
        let value
        value = ''
        expect(unistack.validateCommand(value)).toBe(errorMessage)
        value = '\n'
        expect(unistack.validateCommand(value)).toBe(errorMessage)
    })
})