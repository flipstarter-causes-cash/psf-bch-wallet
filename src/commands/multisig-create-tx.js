/*
  This command creates a transaction for spending from a multisig wallet.

  This command will be customized in the future for minting new tokens, setting
  price of P2WDB writes, etc.

  This command takes as input the multisig wallet object, generated by the
  multisig-create-wallet command. It generates a transaction for spending
  a UTXO from that wallet. That unsigned transaction can then be sent
  to each Minting Council NFT holder.
*/

// Public NPM libraries
// const Conf = require('conf')
// const { Pin, Write } = require('p2wdb')
const SlpWallet = require('minimal-slp-wallet')
const bitcore = require('bitcore-lib-cash')

// Local libraries
const WalletUtil = require('../lib/wallet-util')

const { Command, flags } = require('@oclif/command')

class MultisigCreateTx extends Command {
  constructor (argv, config) {
    super(argv, config)

    // Encapsulate dependencies.
    this.walletUtil = new WalletUtil()
    // this.conf = new Conf()
    // this.Pin = Pin
    // this.Write = Write
    this.wallet = null // placeholder
  }

  async run () {
    try {
      const { flags } = this.parse(MultisigCreateTx)

      // Validate input flags
      this.validateFlags(flags)

      // Instantiate the Write library.
      await this.instantiateWallet(flags)

      const txObj = await this.createMultisigTx(flags)

      console.log('Transaction object: ', JSON.stringify(txObj, null, 2))
      console.log('Stringified transaction object:')
      console.log(JSON.stringify(txObj))

      return true
    } catch (err) {
      console.log('Error in p2wdb-pin.js/run(): ', err.message)

      return 0
    }
  }

  // Create a transaction to spend 1000 sats from the multisig wallet.
  async createMultisigTx (flags) {
    try {
      const walletObj = JSON.parse(flags.wallet)
      console.log('walletObj: ', walletObj)

      // Get UTXO information for the multisig address.
      const utxos = await this.wallet.getUtxos(walletObj.address)
      // Grab the biggest BCH UTXO for spending.
      const utxoToSpend = this.wallet.bchjs.Utxo.findBiggestUtxo(utxos.bchUtxos)
      console.log('utxoToSpend: ', utxoToSpend)

      // Repackage the UTXO for bitcore-lib-cash
      const utxo = {
        txid: utxoToSpend.tx_hash,
        outputIndex: utxoToSpend.tx_pos,
        address: walletObj.address,
        script: walletObj.scriptHex,
        satoshis: utxoToSpend.value
      }

      const chosenAddr = 'bitcoincash:qqlrzp23w08434twmvr4fxw672whkjy0py26r63g3d'

      // Generate a multisignature transaction.
      const multisigTx = new bitcore.Transaction()
        .from(utxo, walletObj.publicKeys, walletObj.requiredSigners)
        // Send 1000 sats back to the chosen address.
        .to(chosenAddr, 1000)
        .feePerByte(1)
        // Send change back to the multisig address
        .change(walletObj.address)

      // This unsigned transaction object is sent to all participants.
      const unsignedTxObj = multisigTx.toObject()

      return unsignedTxObj
    } catch (err) {
      console.error('Error in createMultisigTx()')
      throw err
    }
  }

  // Generate a P2SH multisignature wallet from the public keys of the NFT holders.
  async createMultisigWallet (flags) {
    try {
      const pubKeyPairs = JSON.parse(flags.pairs)
      const pubKeys = []

      // Isolate just an array of public keys.
      for (let i = 0; i < pubKeyPairs.length; i++) {
        const thisPair = pubKeyPairs[i]

        pubKeys.push(thisPair.pubKey)
      }

      // Determine the number of signers. It's 50% + 1
      const requiredSigners = Math.floor(pubKeys.length / 2) + 1

      // Multisig Address
      const msAddr = new bitcore.Address(pubKeys, requiredSigners)

      // Locking Script in hex representation.
      const scriptHex = new bitcore.Script(msAddr).toHex()

      const walletObj = {
        address: msAddr.toString(),
        scriptHex,
        publicKeys: pubKeys,
        requiredSigners
      }

      return walletObj
    } catch (err) {
      console.error('Error in createMultisigWallet()')
      throw err
    }
  }

  // Instatiate the wallet library.
  async instantiateWallet (flags) {
    try {
      // // Instantiate the wallet.
      // this.wallet = await this.walletUtil.instanceWallet(flags.name)
      // // console.log(`wallet.walletInfo: ${JSON.stringify(wallet.walletInfo, null, 2)}`)
      //
      // return true

      const wallet = new SlpWallet(undefined, { interface: 'consumer-api' })

      await wallet.walletInfoPromise

      this.wallet = wallet

      return wallet
    } catch (err) {
      console.error('Error in instantiateWrite()')
      throw err
    }
  }

  // Validate the proper flags are passed in.
  validateFlags (flags) {
    // Exit if wallet not specified.
    const wallet = flags.wallet
    if (!wallet || wallet === '') {
      throw new Error('You must specify a JSON string of the wallet object with the -w flag.')
    }

    return true
  }
}

MultisigCreateTx.description = `Create a multisig transaction

This command creates a transaction for spending from a multisig wallet.

This command will be customized in the future for minting new tokens, setting
price of P2WDB writes, etc.

This command takes as input the multisig wallet object, generated by the
multisig-create-wallet command. It generates a transaction for spending
a UTXO from that wallet. That unsigned transaction can then be sent
to each Minting Council NFT holder.
`

MultisigCreateTx.flags = {
  wallet: flags.string({ char: 'w', description: 'JSON string of the multisig wallet object' })
}

module.exports = MultisigCreateTx
