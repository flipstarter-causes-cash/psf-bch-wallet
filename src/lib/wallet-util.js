/*
  Utility library for working with wallet files.
*/

// Global npm libraries.
const fs = require('fs').promises
const BCHJS = require('@psf/bch-js')
const Conf = require('conf')
const BchWallet = require('minimal-slp-wallet')
const MsgLib = require('bch-message-lib/index')

let _this // Global variable points at instance of this Class.

class WalletUtil {
  constructor (localConfig = {}) {
    // Encapsulate dependencies
    this.fs = fs
    this.bchjs = new BCHJS()
    this.conf = new Conf()
    this.BchWallet = BchWallet
    this.MsgLib = MsgLib

    // Variables that can be controlled externally.
    this.advancedConfig = {
      interface: 'consumer-api'
    }

    _this = this
  }

  // Save the wallet data into a .json text file.
  async saveWallet (filename, walletData) {
    await _this.fs.writeFile(filename, JSON.stringify(walletData, null, 2))

    return true
  }

  // Generates an array of HD addresses.
  // Address are generated from index to limit.
  // e.g. generateAddress(walletData, 20, 10)
  // will generate a 10-element array of addresses from index 20 to 29
  async generateAddress (walletData, index, limit) {
    // console.log(`walletData: ${JSON.stringify(walletData, null, 2)}`)

    if (!walletData.mnemonic) throw new Error('mnemonic is undefined!')

    // root seed buffer
    const rootSeed = await this.bchjs.Mnemonic.toSeed(walletData.mnemonic)

    // master HDNode
    const masterHDNode = this.bchjs.HDNode.fromSeed(rootSeed)

    // HDNode of BIP44 account
    const account = this.bchjs.HDNode.derivePath(
      masterHDNode,
      `m/44'/${walletData.derivation}'/0'`
    )

    // Empty array for collecting generated addresses
    const bulkAddresses = []

    // Generate the addresses.
    for (let i = index; i < index + limit; i++) {
      // derive an external change address HDNode
      const change = this.bchjs.HDNode.derivePath(account, `0/${i}`)

      // get the cash address
      const newAddress = this.bchjs.HDNode.toCashAddress(change)
      // const legacy = this.bchjs.HDNode.toLegacyAddress(change)

      // push address into array
      bulkAddresses.push(newAddress)
    }

    return bulkAddresses
  }

  // Retrieves the 12-word menomnic used for e2e encryption with the wallet
  // service. If it doesn't exist in the config, then it will be created.
  // CT 4/20/22: Should this be deprecated? Might be leftover from when this
  // app ran an internal IPFS node with the 'daemon' command.
  getEncryptionMnemonic () {
    let e2eeMnemonic = this.conf.get('e2eeMnemonic', false)

    // If the mnemonic doesn't exist, generate it and save to the config.
    if (!e2eeMnemonic) {
      const mnemonic = this.bchjs.Mnemonic.generate(
        128,
        this.bchjs.Mnemonic.wordLists().english
      )

      this.conf.set('e2eeMnemonic', mnemonic)

      e2eeMnemonic = mnemonic
    }

    return e2eeMnemonic
  }

  // Retrieve the interface and server URL from the config.
  // Generate the default of web3 public server if the values have not been set.
  getRestServer () {
    try {
      const outObj = {
        restURL: this.conf.get('restURL', false),
        interface: this.conf.get('interface', false)
      }

      if (!outObj.restURL) {
        outObj.restURL = 'https://free-bch.fullstack.cash'

        this.conf.set('restURL', outObj.restURL)
      }

      if (!outObj.interface) {
        outObj.interface = 'consumer-api'

        this.conf.set('interface', outObj.interface)
      }

      return outObj
    } catch (err) {
      console.log('Error in getRestServer()')
      throw err
    }
  }

  // Retrieve the REST API server address from the config. Generate the default
  // if it has not yet been set.
  getP2wdbServer () {
    try {
      let p2wdbServer = this.conf.get('p2wdbServer', false)

      if (!p2wdbServer) {
        p2wdbServer = 'https://p2wdb.fullstack.cash'

        this.conf.set('p2wdbServer', p2wdbServer)
      }

      return p2wdbServer
    } catch (err) {
      console.log('Error in getP2wdbServer()')
      throw err
    }
  }

  // Get the pinning server. This is the REST API that allows us to pin
  // content from P2WDB to its IPFS node, so that it can be seeded to the
  // P2WDB pinning cluster.
  getPinServer () {
    try {
      let pinServer = this.conf.get('pinServer', false)

      if (!pinServer) {
        pinServer = 'https://p2wdb-pin.fullstack.cash'

        this.conf.set('pinServer', pinServer)
      }

      return pinServer
    } catch (err) {
      console.log('Error in getPinServer()')
      throw err
    }
  }

  // Takes the wallet filename as input and returns an instance of
  // minimal-slp-wallet.
  async instanceWallet (walletName) {
    try {
      // Input validation
      if (!walletName || typeof walletName !== 'string') {
        throw new Error('walletName is required.')
      }

      const filePath = `${__dirname.toString()}/../../.wallets/${walletName}.json`

      // Load the wallet file.
      const walletJSON = require(filePath)
      const walletData = walletJSON.wallet

      // Get the currently selected REST server from the config.
      const server = this.getRestServer()
      // console.log(`restURL: ${server.restURL}`)
      // console.log(`interface: ${server.interface}`)

      // Hook for unit tests, to disable network calls.
      if (walletName === 'test123') {
        this.advancedConfig.noUpdate = true
      }

      // Configure the minimal-slp-wallet library.
      if (server.restURL) {
        this.advancedConfig.restURL = server.restURL
      }
      if (this.advancedConfig.interface !== server.interface) {
        this.advancedConfig.interface = server.interface
      }
      const bchWallet = new this.BchWallet(
        walletData.mnemonic,
        this.advancedConfig
      )

      // Wait for the wallet to initialize and retrieve UTXO data from the
      // blockchain.
      await bchWallet.walletInfoPromise
      await bchWallet.initialize()

      return bchWallet
    } catch (err) {
      console.error('Error in wallet-util.js/instanceWallet()')
      throw err
    }
  }

  // Instantiate the bch-message-lib library with an instance of minimal-slp-wallet.
  instanceMsgLib (wallet) {
    if (!wallet) {
      throw new Error('Must pass instance of minimal-slp-wallet.')
    }

    const msgLib = new this.MsgLib({ wallet })

    return msgLib
  }

  // Wrapper for broadcasting a transaction.
  async broadcastTx (wallet, hex) {
    const txid = await wallet.ar.sendTx(hex)

    return txid
  }
}

module.exports = WalletUtil
