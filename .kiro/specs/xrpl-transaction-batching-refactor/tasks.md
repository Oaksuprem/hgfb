# Implementation Plan: XRPL Transaction Batching Refactor

## Overview

This plan implements a modular, testable transaction batching system for the XRPL client. The refactor extracts repeated transaction patterns into reusable hooks and domain services while adding XRPL Ticket workflow support for parallel batch operations. All existing single-transaction flows continue to work without modification—batching is opt-in.

The implementation follows a 6-phase approach: batch infrastructure, transaction hooks, service modules, parser/validator/serializer, batch workflows UI, and migration/documentation.

## Tasks

### Phase 1: Batch Infrastructure

- [ ] 1. Set up batch utilities module structure
  - Create `src/utils/batch.js` file
  - Add JSDoc comments for module overview
  - Export placeholder functions for createTickets, buildBatchTransaction, submitBatch
  - _Requirements: 2.1_

- [ ] 2. Implement createTickets function
  - [ ] 2.1 Implement TicketCreate transaction building and submission
    - Accept account, count, client, wallet parameters
    - Validate count is between 2 and 250
    - Build TicketCreate transaction with TicketCount field
    - Submit using client.submitAndWait
    - Extract ticket sequences from result metadata
    - Return array of ticket sequence numbers
    - _Requirements: 1.1, 1.2, 1.7, 2.1, 2.2_
  
  - [ ]* 2.2 Write unit tests for createTickets
    - Test valid ticket creation (count = 2, 10, 250)
    - Test boundary validation (count = 1, 251)
    - Test error handling for failed TicketCreate
    - Mock xrpl client and wallet
    - _Requirements: 2.1, 2.2_

- [ ] 3. Implement buildBatchTransaction function
  - [ ] 3.1 Implement ticket-based transaction building
    - Accept txFields, ticketSequence, client parameters
    - Set TicketSequence field in transaction
    - Ensure Sequence field is omitted
    - Call client.autofill to fill Fee, LastLedgerSequence
    - Force TicketSequence back after autofill (autofill may overwrite)
    - Return autofilled transaction
    - _Requirements: 1.3, 2.3, 2.4, 21.4_
  
  - [ ]* 3.2 Write unit tests for buildBatchTransaction
    - Test transaction contains TicketSequence
    - Test transaction does not contain Sequence
    - Test autofill is called
    - Test TicketSequence preserved after autofill
    - Mock xrpl client
    - _Requirements: 2.4, 21.4_

- [ ] 4. Implement submitBatch function
  - [ ] 4.1 Implement parallel batch submission
    - Accept transactions array, client, wallet, onTxComplete callback
    - Sign each transaction with wallet
    - Use Promise.allSettled to submit all transactions in parallel
    - Call onTxComplete callback for each completed transaction
    - Map results to { success, hash, error, index } objects
    - Return array of result objects
    - _Requirements: 1.4, 1.5, 1.6, 1.8, 2.5, 2.6, 2.7_
  
  - [ ]* 4.2 Write unit tests for submitBatch
    - Test parallel submission using Promise.allSettled
    - Test success result structure
    - Test failure result structure
    - Test mixed success/failure results
    - Test onTxComplete callback invocation
    - Mock xrpl client and wallet
    - _Requirements: 1.5, 1.6, 2.6, 2.7_

- [ ] 5. Checkpoint - Verify batch utilities
  - Ensure all tests pass, ask the user if questions arise.

### Phase 2: Transaction Hooks

- [ ] 6. Set up transaction hooks directory
  - Create `src/hooks/transactions/` directory
  - Add README.md explaining hook purposes
  - _Requirements: 18.2, 18.9, 18.10, 18.11_

- [ ] 7. Implement useTxBuilder hook
  - [ ] 7.1 Create useTxBuilder hook with state management
    - Import useXrpl hook for context access
    - Define state: builtTx, building, error
    - Implement buildTransaction function with useCallback
    - Call ensureConnected to get client
    - Call client.autofill with transaction fields
    - Update state with filled transaction or error
    - Return { builtTx, building, error, buildTransaction }
    - _Requirements: 3.1, 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_
  
  - [ ]* 7.2 Write unit tests for useTxBuilder
    - Test buildTransaction calls ensureConnected
    - Test buildTransaction calls client.autofill
    - Test building state transitions
    - Test error state on autofill failure
    - Test builtTx state on success
    - Use React Testing Library and mock XrplContext
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_

- [ ] 8. Implement useTxSubmit hook
  - [ ] 8.1 Create useTxSubmit hook with state management
    - Import useXrpl hook for context access
    - Define state: result, submitting, error
    - Implement submitTransaction function with useCallback
    - Accept transaction and optional walletSeed parameters
    - Call ensureConnected to get client
    - Create wallet from seed using xrpl.Wallet.fromSeed
    - Call client.submitAndWait with transaction and wallet
    - Call addTx on success
    - Update state with result or error
    - Compute success boolean from TransactionResult
    - Return { result, submitting, error, success, submitTransaction }
    - _Requirements: 3.1, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_
  
  - [ ]* 8.2 Write unit tests for useTxSubmit
    - Test submitTransaction calls ensureConnected
    - Test wallet creation from seed
    - Test client.submitAndWait is called
    - Test addTx is called on success
    - Test submitting state transitions
    - Test error state on submission failure
    - Test success boolean derivation
    - Use React Testing Library and mock XrplContext
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

- [ ] 9. Implement useTxBatch hook
  - [ ] 9.1 Create useTxBatch hook with ticket state management
    - Import useXrpl hook and batch utilities
    - Define ticket state: tickets, ticketLoading, ticketError
    - Define batch build state: builtBatch, batchLoading, batchError
    - Define submit state: results, submitLoading, submitError
    - Implement createTicketBatch function
    - Validate count is 2-250
    - Call createTickets utility with wallet and client
    - Update tickets state
    - _Requirements: 3.1, 3.2, 3.3, 3.7_
  
  - [ ] 9.2 Implement batch building in useTxBatch
    - Implement buildBatch function
    - Validate sufficient tickets available
    - Loop through transaction fields array
    - Call buildBatchTransaction for each with corresponding ticket
    - Update builtBatch state
    - _Requirements: 3.4, 3.5, 3.7_
  
  - [ ] 9.3 Implement batch submission in useTxBatch
    - Implement submitBatch function
    - Validate builtBatch is not empty
    - Call submitBatch utility with builtBatch
    - Pass addTx as onTxComplete callback
    - Update results state
    - Implement reset function to clear all state
    - Return all state and functions
    - _Requirements: 3.6, 3.7, 3.8, 3.9, 3.10, 2.8_
  
  - [ ]* 9.4 Write unit tests for useTxBatch
    - Test createTicketBatch validation and execution
    - Test buildBatch validation and ticket usage
    - Test submitBatch execution
    - Test loading states for all phases
    - Test error states for all phases
    - Test reset function
    - Use React Testing Library and mock XrplContext
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [ ] 10. Checkpoint - Verify transaction hooks
  - Ensure all tests pass, ask the user if questions arise.

### Phase 3: Service Modules

- [ ] 11. Set up services directory
  - Create `src/services/` directory
  - Add README.md explaining service module architecture
  - _Requirements: 18.1, 18.4, 18.5, 18.6, 18.7, 18.8_

- [ ] 12. Implement TokenService module
  - [ ] 12.1 Implement issuer configuration functions
    - Create TokenService.js file
    - Import xrpl library
    - Implement buildConfigureIssuer function
    - Accept account, setFlag, clearFlag, transferRate, tickSize, domain, emailHash, messageKey
    - Map flag strings to AccountSet flag numbers
    - Calculate TransferRate from percentage
    - Convert domain string to hex
    - Return AccountSet transaction fields
    - _Requirements: 6.1, 6.14, 20.4_
  
  - [ ] 12.2 Implement fungible token functions
    - Implement buildDistributeFungibleToken function
    - Accept account, destination, currency, amount, partial, sendMax, deliverMin, destinationTag, memo
    - Build Payment transaction with issued currency Amount
    - Handle tfPartialPayment flag and related fields
    - Convert memo to hex
    - Return transaction fields
    - Implement buildAuthorizeTrustLine function for issuer-side trust line authorization
    - Implement buildClawbackToken function
    - _Requirements: 6.2, 6.3, 6.4, 6.14, 20.4_
  
  - [ ] 12.3 Implement NFT functions
    - Implement buildMintNFT with taxon, uri, transferFee, flags, issuer
    - Calculate NFT flags bitmask from boolean flags object
    - Calculate TransferFee from percentage
    - Convert URI to hex
    - Implement buildCreateNFTOffer for sell and buy offers
    - Implement buildAcceptNFTOffer with optional broker fee
    - Implement buildCancelNFTOffer accepting array of offer IDs
    - Implement buildBurnNFT
    - Return transaction fields for each
    - _Requirements: 6.5, 6.6, 6.7, 6.8, 6.9, 6.14, 20.4_
  
  - [ ] 12.4 Implement MPT functions
    - Implement buildCreateMPT with maxAmount, assetScale, transferFee, metadata, flags
    - Implement buildAuthorizeMPT for holder authorization
    - Implement buildDistributeMPT with MPT amount structure
    - Implement buildDestroyMPT
    - Return transaction fields for each
    - _Requirements: 6.10, 6.11, 6.12, 6.13, 6.14, 20.4_
  
  - [ ]* 12.5 Write unit tests for TokenService
    - Test buildConfigureIssuer with various flag combinations
    - Test buildDistributeFungibleToken with standard and partial payments
    - Test buildAuthorizeTrustLine transaction structure
    - Test buildClawbackToken transaction structure
    - Test buildMintNFT with various flag combinations
    - Test buildCreateNFTOffer for sell and buy offers
    - Test buildAcceptNFTOffer with and without broker fee
    - Test buildCancelNFTOffer with multiple offer IDs
    - Test buildBurnNFT transaction structure
    - Test buildCreateMPT with various options
    - Test buildAuthorizeMPT transaction structure
    - Test buildDistributeMPT transaction structure
    - Test buildDestroyMPT transaction structure
    - Verify all functions return plain objects without side effects
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13, 6.14_

- [ ] 13. Implement CredentialService module
  - [ ] 13.1 Create CredentialService with transaction builders
    - Create CredentialService.js file
    - Import xrpl library
    - Implement buildCreateCredential with account, subject, credentialType, expiration, uri
    - Convert credentialType to hex
    - Calculate expiration in Ripple epoch format
    - Implement buildAcceptCredential
    - Implement buildDeleteCredential with optional subject
    - Return transaction fields
    - _Requirements: 7.1, 7.2, 7.3, 7.6, 20.4_
  
  - [ ] 13.2 Add credential query function
    - Implement queryCredentials async function
    - Accept account and client parameters
    - Call client.request with account_objects command
    - Filter for credential type
    - Return account_objects array
    - _Requirements: 7.4, 7.5_
  
  - [ ]* 13.3 Write unit tests for CredentialService
    - Test buildCreateCredential transaction structure
    - Test credentialType hex conversion
    - Test expiration calculation
    - Test buildAcceptCredential transaction structure
    - Test buildDeleteCredential with and without subject
    - Test queryCredentials with mocked client
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 14. Implement DomainService module
  - [ ] 14.1 Create DomainService with transaction builders
    - Create DomainService.js file
    - Import xrpl library
    - Implement buildSetDomain accepting account and domain
    - Convert domain to hex if not already hex
    - Implement buildDeleteDomain
    - Return transaction fields
    - _Requirements: 8.1, 8.2, 8.3, 8.6, 20.4_
  
  - [ ] 14.2 Add domain query function
    - Implement queryDomains async function
    - Accept account and client parameters
    - Call client.request with account_objects command
    - Filter for permissioned_domain type
    - Return account_objects array
    - _Requirements: 8.4, 8.5_
  
  - [ ]* 14.3 Write unit tests for DomainService
    - Test buildSetDomain with string and hex domain
    - Test buildDeleteDomain transaction structure
    - Test queryDomains with mocked client
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 15. Implement DexService module
  - [ ] 15.1 Create DexService with offer functions
    - Create DexService.js file
    - Import xrpl library
    - Implement buildCreateOffer with takerGets, takerPays, flags, expiration, offerSequence, domainID
    - Calculate flags bitmask from boolean flags object
    - Convert expiration to Ripple epoch
    - Implement buildCancelOffer
    - _Requirements: 9.1, 9.2, 9.10, 20.4_
  
  - [ ] 15.2 Implement AMM functions
    - Implement buildCreateAMM with amount, amount2, tradingFee
    - Implement buildDepositAMM with asset, asset2, amounts, lpTokenOut, flags
    - Implement buildWithdrawAMM with asset, asset2, amounts, lpTokenIn, flags
    - Implement buildVoteAMM with asset, asset2, tradingFee
    - Implement buildBidAMM with asset, asset2, bidMin, bidMax, authAccounts
    - Format authAccounts array properly
    - Return transaction fields for each
    - _Requirements: 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 20.4_
  
  - [ ] 15.3 Add DEX query function
    - Implement queryOffers async function
    - Accept account and client parameters
    - Call client.request with account_offers command
    - Return offers array
    - _Requirements: 9.3, 9.4_
  
  - [ ]* 15.4 Write unit tests for DexService
    - Test buildCreateOffer with various flag combinations
    - Test buildCreateOffer with domainID for permissioned DEX
    - Test buildCancelOffer transaction structure
    - Test buildCreateAMM transaction structure
    - Test buildDepositAMM with different flag combinations
    - Test buildWithdrawAMM with different flag combinations
    - Test buildVoteAMM transaction structure
    - Test buildBidAMM with and without authAccounts
    - Test queryOffers with mocked client
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10_

- [ ] 16. Implement OracleService module
  - [ ] 16.1 Create OracleService with transaction builders
    - Create OracleService.js file
    - Import xrpl library
    - Implement buildSetOracle with oracleDocumentID, assetClass, provider, lastUpdateTime, priceDataSeries, uri
    - Convert assetClass to hex
    - Convert provider to hex if not already hex
    - Format priceDataSeries array with PriceData wrapper objects
    - Convert baseAsset and quoteAsset to hex for each price data
    - Implement buildDeleteOracle
    - Return transaction fields
    - _Requirements: 10.1, 10.2, 10.3, 10.6, 20.4_
  
  - [ ] 16.2 Add oracle query function
    - Implement queryOracle async function
    - Accept oracleDocumentID and client parameters
    - Call client.request with ledger_entry command and oracle filter
    - Return oracle node or null
    - _Requirements: 10.4, 10.5_
  
  - [ ]* 16.3 Write unit tests for OracleService
    - Test buildSetOracle with single and multiple price data series
    - Test hex conversion for assetClass and provider
    - Test price data formatting
    - Test buildDeleteOracle transaction structure
    - Test queryOracle with mocked client
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [ ] 17. Checkpoint - Verify service modules
  - Ensure all tests pass, ask the user if questions arise.

### Phase 4: Parser/Validator/Serializer

- [ ] 18. Implement batch configuration parser
  - [ ] 18.1 Create batch configuration utilities file
    - Create `src/utils/batchConfig.js` file
    - Add module overview documentation
    - Import xrpl library for validation
    - _Requirements: 27.1_
  
  - [ ] 18.2 Implement parseBatchConfiguration function
    - Accept JSON string or object parameter
    - Parse JSON string if needed
    - Validate top-level structure (array of transactions)
    - Extract transaction fields for each transaction
    - Return array of transaction field objects or throw error
    - _Requirements: 27.1, 27.2_
  
  - [ ]* 18.3 Write unit tests for parser
    - Test parsing valid batch configuration
    - Test parsing JSON string vs object
    - Test error handling for invalid JSON
    - Test error handling for invalid structure
    - _Requirements: 27.1, 27.6_

- [ ] 19. Implement batch configuration formatter
  - [ ] 19.1 Implement formatBatchConfiguration function
    - Accept array of transaction field objects
    - Convert to JSON with 2-space indentation
    - Return formatted JSON string
    - _Requirements: 27.3, 27.4, 28.3_
  
  - [ ]* 19.2 Write property test for round-trip serialization
    - **Property 5: Batch Configuration Round-Trip**
    - **Validates: Requirements 27.1, 27.3, 27.5**
    - Use fast-check to generate random valid batch configurations
    - Verify parse(format(config)) equals original config
    - Verify format(parse(json)) produces equivalent JSON
    - Run 100 iterations minimum
    - _Requirements: 27.5_

- [ ] 20. Implement batch configuration validator
  - [ ] 20.1 Implement transaction type validation
    - Create validateBatchConfiguration function
    - Define KNOWN_TX_TYPES array with supported XRPL transaction types
    - Check each transaction's TransactionType is in known types
    - Return validation errors array
    - _Requirements: 27.7, 29.1_
  
  - [ ] 20.2 Implement required field validation
    - Define REQUIRED_FIELDS map for each transaction type
    - Check required fields are present for each transaction
    - Add errors with transaction index and missing field name
    - _Requirements: 27.2, 29.2_
  
  - [ ] 20.3 Implement field type validation
    - Define FIELD_TYPES map for common fields
    - Check each field value matches expected type
    - Add errors for type mismatches
    - _Requirements: 29.3_
  
  - [ ] 20.4 Implement address and currency validation
    - Use xrpl.isValidAddress for all address fields
    - Validate currency codes are 3-char ASCII or 40-char hex
    - Add errors for invalid addresses or currency codes
    - _Requirements: 29.4, 29.5_
  
  - [ ] 20.5 Format validation error array
    - Ensure each error has index, field, message properties
    - Return empty array for valid configurations
    - _Requirements: 29.6, 29.7_
  
  - [ ]* 20.6 Write property tests for validation
    - **Property 6: Transaction Type Validation**
    - **Validates: Requirements 27.7, 29.1**
    - Generate random transaction types (valid and invalid)
    - Verify known types pass, unknown types fail
    - **Property 7: Required Field Validation**
    - **Validates: Requirements 27.2, 29.2**
    - Generate transactions with missing fields
    - Verify validation catches all missing required fields
    - **Property 8: Field Type Validation**
    - **Validates: Requirements 29.3**
    - Generate transactions with type mismatches
    - Verify validation catches type errors
    - **Property 9: Address Field Validation**
    - **Validates: Requirements 29.4**
    - Generate transactions with valid and invalid addresses
    - Verify xrpl.isValidAddress is used correctly
    - **Property 10: Currency Code Format Validation**
    - **Validates: Requirements 29.5**
    - Generate various currency code formats
    - Verify 3-char and 40-char hex pass, others fail
    - **Property 11: Validation Error Structure**
    - **Validates: Requirements 29.6**
    - Generate invalid configurations
    - Verify error structure contains index, field, message
    - **Property 12: Validation Success Condition**
    - **Validates: Requirements 29.7**
    - Generate valid configurations
    - Verify validator returns empty error array
    - Use fast-check for all property tests
    - Run 100 iterations minimum per property
    - _Requirements: 27.2, 27.7, 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7_

- [ ] 21. Implement pretty printer
  - [ ] 21.1 Implement prettyPrintBatch function
    - Accept batch configuration object
    - Format with 2-space indentation
    - Display transaction type and index prominently
    - Escape special characters in strings
    - Return formatted string
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5_
  
  - [ ]* 21.2 Write unit tests for pretty printer
    - Test indentation consistency
    - Test special character escaping
    - Test output is valid JSON
    - Test parser can read pretty-printed output
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5_

- [ ] 22. Checkpoint - Verify parser/validator/serializer
  - Ensure all tests pass, ask the user if questions arise.

### Phase 5: Batch Workflows UI

- [ ] 23. Add batch UI to CredentialsPage
  - [ ] 23.1 Integrate useTxBatch hook in CredentialsPage
    - Import useTxBatch and CredentialService
    - Add state for multiple credential subjects and types
    - Add UI form for entering multiple subjects
    - Add "Create Batch" button
    - _Requirements: 11.1_
  
  - [ ] 23.2 Implement multi-credential workflow
    - Handle batch creation button click
    - Create tickets with count equal to number of credentials
    - Build CredentialCreate transactions for each subject using CredentialService
    - Call buildBatch from useTxBatch
    - Call submitBatch
    - Display progress and individual results
    - _Requirements: 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

- [ ] 24. Add NFT collection minting to IssuePage
  - [ ] 24.1 Integrate useTxBatch hook for NFT minting
    - Import useTxBatch and TokenService
    - Add state for collection parameters (count, base URI, taxon, transfer fee)
    - Add UI form for NFT collection configuration
    - Add "Mint Collection" button
    - _Requirements: 12.1_
  
  - [ ] 24.2 Implement NFT collection minting workflow
    - Handle mint collection button click
    - Validate count is 2-250
    - Create tickets with count equal to NFT count
    - Build NFTokenMint transactions for each NFT using TokenService
    - Append index to URI for each NFT
    - Call buildBatch from useTxBatch
    - Call submitBatch
    - Display progress with individual NFT results
    - Extract and display NFToken IDs from results
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

- [ ] 25. Add MPT multi-holder workflows to IssuePage
  - [ ] 25.1 Integrate MPT authorization batch workflow
    - Add state for multiple holder addresses
    - Add UI form for entering holder addresses
    - Add "Authorize Holders" button
    - Handle authorization batch click
    - Create tickets with count equal to holder count
    - Build MPTokenAuthorize transactions using TokenService
    - Call buildBatch and submitBatch
    - Display progress and results
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_
  
  - [ ] 25.2 Implement MPT distribution batch workflow
    - Add state for multiple holder addresses and amounts
    - Add UI form for entering distribution details
    - Add "Distribute Tokens" button
    - Handle distribution batch click
    - Create tickets with count equal to holder count
    - Build Payment transactions with MPT amounts using TokenService
    - Call buildBatch and submitBatch
    - Display progress and results
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7_

- [ ] 26. Add batch offer workflows to DexPage
  - [ ] 26.1 Integrate batch offer creation
    - Import useTxBatch and DexService
    - Add state for multiple offer pairs
    - Add UI form for entering offer pairs (TakerGets/TakerPays)
    - Add "Create Batch" button
    - Handle batch creation button click
    - Create tickets with count equal to offer count
    - Build OfferCreate transactions using DexService
    - Call buildBatch and submitBatch
    - Display progress and results
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_
  
  - [ ] 26.2 Integrate batch offer cancellation
    - Add UI for selecting multiple offers to cancel
    - Add "Cancel Selected" button
    - Handle batch cancellation button click
    - Create tickets with count equal to selected offer count
    - Build OfferCancel transactions using DexService
    - Call buildBatch and submitBatch
    - Display progress and results
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

- [ ] 27. Add batch trust line workflow to TrustLinePage
  - [ ] 27.1 Integrate useTxBatch hook for trust lines
    - Import useTxBatch
    - Add state for multiple trust line specifications
    - Add UI form for entering multiple trust lines (currency, issuer, limit)
    - Add "Create Batch" button
    - _Requirements: 17.1_
  
  - [ ] 27.2 Implement multi-trust-line workflow
    - Handle batch creation button click
    - Create tickets with count equal to trust line count
    - Build TrustSet transactions for each specification
    - Call buildBatch and submitBatch
    - Display progress and results
    - _Requirements: 17.2, 17.3, 17.4, 17.5, 17.6, 17.7_

- [ ] 28. Implement batch progress reporting component
  - [ ] 28.1 Create BatchProgress component
    - Accept batch state (ticketLoading, batchLoading, submitLoading, results)
    - Display current operation status (creating tickets, building, submitting)
    - Show progress bar for batch submission
    - Display individual transaction results as they complete
    - Show success/failure indicators with transaction hashes
    - Display summary on completion (success count, failure count)
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7_
  
  - [ ] 28.2 Integrate BatchProgress into batch workflows
    - Add BatchProgress component to CredentialsPage batch workflow
    - Add BatchProgress component to IssuePage NFT and MPT workflows
    - Add BatchProgress component to DexPage batch workflows
    - Add BatchProgress component to TrustLinePage batch workflow
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7_

- [ ] 29. Checkpoint - Verify batch workflows UI
  - Ensure all tests pass, ask the user if questions arise.

### Phase 6: Migration and Documentation

- [ ] 30. Create migration guide document
  - [ ] 30.1 Create docs directory and migration guide
    - Create `docs/` directory if not exists
    - Create `docs/transaction-migration-guide.md`
    - Add introduction explaining refactor purpose
    - _Requirements: 30.1_
  
  - [ ] 30.2 Document legacy vs new patterns
    - Show side-by-side comparison of legacy submitAndWait pattern
    - Show new hook-based pattern with useTxBuilder and useTxSubmit
    - Explain benefits of new pattern (testability, reusability, state management)
    - _Requirements: 30.2_
  
  - [ ] 30.3 Document service migration examples
    - Show example of converting IssuePage distribute function to use TokenService
    - Show example of converting DexPage offer creation to use DexService
    - Explain when to use services vs direct transaction building
    - _Requirements: 30.3_
  
  - [ ] 30.4 Document batching usage
    - Explain when to use batching vs single submission
    - Show example batch workflow from start to finish
    - Document batch size considerations (2-250 limit)
    - Explain ticket lifecycle
    - _Requirements: 30.4_
  
  - [ ] 30.5 Document APIs
    - Document all service module functions with parameters
    - Document all hook APIs with state and functions
    - Document batch utility functions
    - Document parser/validator/serializer functions
    - _Requirements: 30.5, 30.6_
  
  - [ ] 30.6 Document backward compatibility
    - Explain XrplContext API remains unchanged
    - Document coexistence of legacy and new patterns
    - Explain no breaking changes guarantee
    - List files that remain unchanged
    - _Requirements: 30.7_

- [ ] 31. Migrate example pages
  - [ ] 31.1 Migrate SendPage to use new hooks
    - Import useTxBuilder and useTxSubmit
    - Replace direct submitAndWait with hook usage
    - Update UI to show building and submitting states
    - Test all send functionality works unchanged
    - _Requirements: 19.2, 19.5_
  
  - [ ] 31.2 Migrate IssuePage distribute to use TokenService
    - Import TokenService and useTxBuilder, useTxSubmit
    - Replace inline transaction building with buildDistributeFungibleToken
    - Update workflow to use hooks
    - Test distribution functionality works unchanged
    - _Requirements: 19.2, 19.5, 20.1_
  
  - [ ] 31.3 Migrate DexPage offer creation to use DexService
    - Import DexService and transaction hooks
    - Replace inline transaction building with buildCreateOffer
    - Update workflow to use hooks
    - Test offer creation functionality works unchanged
    - _Requirements: 19.2, 19.5, 20.1_

- [ ] 32. Verify backward compatibility
  - [ ] 32.1 Test all existing pages without modification
    - Test AccountPage works unchanged
    - Test MultisignPage works unchanged
    - Test OraclePage works unchanged
    - Test SponsorPage works unchanged
    - Test ConfidentialTokensPage works unchanged
    - Test PermissionedDexPage works unchanged
    - Verify useMultisign hook continues to work
    - _Requirements: 19.1, 19.2, 19.4_
  
  - [ ] 32.2 Verify XrplContext API unchanged
    - Verify xrpl export unchanged
    - Verify wallet export unchanged
    - Verify ensureConnected export unchanged
    - Verify addTx export unchanged
    - Verify connect export unchanged
    - Verify disconnect export unchanged
    - Verify txHistory export unchanged
    - _Requirements: 19.3_
  
  - [ ] 32.3 Verify coexistence of patterns
    - Test page using legacy pattern executes transaction successfully
    - Test page using new hooks executes transaction successfully
    - Verify both patterns update transaction history correctly
    - Verify no conflicts between patterns
    - _Requirements: 19.5, 19.6_

- [ ] 33. Add integration tests
  - [ ]* 33.1 Write integration test for single transaction flow
    - Use XRPL Testnet
    - Fund test account from faucet
    - Use useTxBuilder and useTxSubmit to send XRP payment
    - Verify transaction appears on ledger
    - Verify transaction history updated
    - _Requirements: 4.1, 5.1_
  
  - [ ]* 33.2 Write integration test for batch workflow
    - Use XRPL Testnet
    - Fund test account from faucet
    - Use useTxBatch to create tickets
    - Build batch of 3 XRP payments
    - Submit batch
    - Verify all transactions appear on ledger
    - Verify transaction history updated for each
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8_
  
  - [ ]* 33.3 Write integration test for service + hook workflow
    - Use XRPL Testnet
    - Fund test account from faucet
    - Use TokenService.buildConfigureIssuer to build transaction
    - Use useTxBuilder and useTxSubmit to submit
    - Verify account settings updated on ledger
    - _Requirements: 6.1, 20.1, 20.4_

- [ ] 34. Final checkpoint - Complete system verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test-related sub-tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout implementation
- Property tests validate universal correctness properties with randomized inputs
- Integration tests validate end-to-end workflows against real XRPL Testnet
- All service modules return plain transaction objects for testability
- Hooks manage state and side effects (connection, submission, history)
- Batch workflows are opt-in; existing single-transaction flows unchanged
- Migration can proceed page-by-page without breaking existing functionality

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "6", "11", "18.1"] },
    { "id": 1, "tasks": ["2.1", "7.1", "12.1", "18.2"] },
    { "id": 2, "tasks": ["2.2", "3.1", "7.2", "8.1", "12.2", "13.1", "14.1", "15.1", "16.1", "18.3", "19.1"] },
    { "id": 3, "tasks": ["3.2", "4.1", "8.2", "9.1", "12.3", "13.2", "15.2", "19.2"] },
    { "id": 4, "tasks": ["4.2", "9.2", "12.4", "13.3", "14.2", "15.3", "16.2", "20.1"] },
    { "id": 5, "tasks": ["9.3", "12.5", "14.3", "15.4", "16.3", "20.2"] },
    { "id": 6, "tasks": ["9.4", "20.3"] },
    { "id": 7, "tasks": ["20.4"] },
    { "id": 8, "tasks": ["20.5"] },
    { "id": 9, "tasks": ["20.6", "21.1"] },
    { "id": 10, "tasks": ["21.2", "23.1", "24.1", "25.1", "26.1", "27.1", "30.1"] },
    { "id": 11, "tasks": ["23.2", "24.2", "25.2", "26.2", "27.2", "28.1", "30.2"] },
    { "id": 12, "tasks": ["28.2", "30.3"] },
    { "id": 13, "tasks": ["30.4"] },
    { "id": 14, "tasks": ["30.5"] },
    { "id": 15, "tasks": ["30.6", "31.1"] },
    { "id": 16, "tasks": ["31.2"] },
    { "id": 17, "tasks": ["31.3"] },
    { "id": 18, "tasks": ["32.1"] },
    { "id": 19, "tasks": ["32.2"] },
    { "id": 20, "tasks": ["32.3", "33.1"] },
    { "id": 21, "tasks": ["33.2"] },
    { "id": 22, "tasks": ["33.3"] }
  ]
}
```
