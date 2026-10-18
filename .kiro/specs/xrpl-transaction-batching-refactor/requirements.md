# Requirements Document

## Introduction

This document specifies requirements for refactoring the XRPL client codebase to achieve modularity, maintainability, and scalability through ticket-based transaction batching and modular transaction services. The refactor extracts repeated transaction patterns from 50+ submitAndWait calls across 10+ pages into reusable hooks and domain services, while adding XRPL Ticket workflow support for batch operations. All existing single-transaction flows must continue to work without breaking changes—batching is opt-in.

## Glossary

- **XRPL_Client**: The XRP Ledger JavaScript client application
- **Ticket**: An XRPL protocol feature allowing pre-allocation of sequence numbers for parallel transaction submission
- **Transaction_Builder**: Component that constructs XRPL transaction objects with proper fields and validation
- **Transaction_Service**: Domain-specific service encapsulating related transaction operations (e.g., TokenService, CredentialService)
- **Batch_Workflow**: A coordinated sequence of transactions using Tickets for parallel submission
- **XrplContext**: React context providing xrpl library, wallet, connection management, and transaction history
- **Hook**: React custom hook encapsulating reusable stateful logic
- **Domain_Service**: JavaScript class or module grouping related business operations
- **Backward_Compatibility**: Guarantee that existing code continues to function without modification
- **Page_Component**: React component representing a feature page (AccountPage, DexPage, etc.)
- **Submit_Pattern**: The repeated code pattern: ensureConnected() → build tx → submitAndWait() → handle result

## Requirements

### Requirement 1: Ticket-Based Transaction Batching Infrastructure

**User Story:** As a developer, I want ticket-based transaction batching infrastructure, so that I can submit multiple transactions in parallel without sequence number conflicts.

#### Acceptance Criteria

1. THE Batch_Workflow SHALL create Tickets via TicketCreate transaction before batch execution
2. WHEN Tickets are created, THE Batch_Workflow SHALL store Ticket sequence numbers for subsequent use
3. WHEN a batched transaction is built, THE Transaction_Builder SHALL use TicketSequence instead of Sequence
4. WHEN all batched transactions are prepared, THE Batch_Workflow SHALL submit them in parallel
5. THE Batch_Workflow SHALL track completion status for each transaction in the batch
6. IF any transaction in a batch fails, THEN THE Batch_Workflow SHALL report individual failure without blocking other transactions
7. THE Batch_Workflow SHALL support batch sizes from 2 to 250 transactions (XRPL TicketCreate limit)
8. WHEN batch execution completes, THE Batch_Workflow SHALL return results for all transactions

### Requirement 2: Batch Workflow Utilities

**User Story:** As a developer, I want utility functions for batch workflows, so that I can easily implement ticket-based batching in any transaction context.

#### Acceptance Criteria

1. THE Batch_Utility SHALL provide a createTickets function accepting account, ticket count, xrpl client, and wallet
2. WHEN createTickets executes, THE Batch_Utility SHALL submit TicketCreate and return an array of Ticket sequence numbers
3. THE Batch_Utility SHALL provide a buildBatchTransaction function accepting transaction fields and a Ticket sequence
4. WHEN buildBatchTransaction executes, THE Transaction_Builder SHALL set TicketSequence and omit Sequence field
5. THE Batch_Utility SHALL provide a submitBatch function accepting an array of prepared transactions
6. WHEN submitBatch executes, THE Batch_Utility SHALL submit all transactions concurrently using Promise.allSettled
7. THE Batch_Utility SHALL return results containing success status, transaction hash, and error message for each transaction
8. THE Batch_Utility SHALL integrate with XrplContext.addTx for transaction history tracking

### Requirement 3: Batch Transaction React Hook

**User Story:** As a developer, I want a React hook for batch transactions, so that I can manage batch workflow state in page components.

#### Acceptance Criteria

1. THE useTxBatch Hook SHALL manage state for ticket creation, batch building, and submission
2. THE useTxBatch Hook SHALL provide a createTicketBatch function accepting ticket count
3. WHEN createTicketBatch executes, THE Hook SHALL create Tickets and store sequences in state
4. THE useTxBatch Hook SHALL provide a buildBatch function accepting an array of transaction field objects
5. WHEN buildBatch executes, THE Hook SHALL construct transactions using available Tickets and autofill each transaction
6. THE useTxBatch Hook SHALL provide a submitBatch function that submits all prepared transactions
7. THE useTxBatch Hook SHALL expose loading states (ticketLoading, batchLoading) for UI feedback
8. THE useTxBatch Hook SHALL expose error state containing ticket creation errors and individual transaction errors
9. THE useTxBatch Hook SHALL expose results array containing outcome for each submitted transaction
10. THE useTxBatch Hook SHALL provide a reset function to clear batch state

### Requirement 4: Single Transaction Builder Hook

**User Story:** As a developer, I want a transaction builder hook, so that I can construct and autofill single transactions with consistent patterns.

#### Acceptance Criteria

1. THE useTxBuilder Hook SHALL accept transaction fields and return autofilled transaction
2. WHEN buildTransaction executes, THE Hook SHALL call ensureConnected to obtain XRPL client
3. WHEN buildTransaction executes, THE Transaction_Builder SHALL autofill Fee, Sequence, and LastLedgerSequence
4. THE useTxBuilder Hook SHALL expose building state for UI feedback
5. THE useTxBuilder Hook SHALL expose error state for build failures
6. THE useTxBuilder Hook SHALL preserve all provided transaction fields during autofill
7. WHEN autofill completes, THE Hook SHALL return the filled transaction object

### Requirement 5: Single Transaction Submit Hook

**User Story:** As a developer, I want a transaction submit hook, so that I can submit transactions with consistent error handling and history tracking.

#### Acceptance Criteria

1. THE useTxSubmit Hook SHALL accept a transaction object and wallet
2. WHEN submitTransaction executes, THE Hook SHALL call ensureConnected to obtain XRPL client
3. WHEN submitTransaction executes, THE Hook SHALL create wallet from seed using xrpl.Wallet.fromSeed
4. WHEN submitTransaction executes, THE Hook SHALL call client.submitAndWait with transaction and wallet
5. THE useTxSubmit Hook SHALL expose submitting state for UI feedback
6. THE useTxSubmit Hook SHALL expose error state containing submission failure messages
7. THE useTxSubmit Hook SHALL expose result state containing submitAndWait response
8. WHEN submission succeeds, THE Hook SHALL call XrplContext.addTx to record transaction in history
9. THE useTxSubmit Hook SHALL return success boolean based on TransactionResult === 'tesSUCCESS'

### Requirement 6: Token Service Module

**User Story:** As a developer, I want a Token Service module, so that I can perform FT, NFT, and MPT operations through a consistent interface.

#### Acceptance Criteria

1. THE Token_Service SHALL provide configureIssuer function accepting AccountSet parameters
2. THE Token_Service SHALL provide distributeFungibleToken function accepting Payment parameters
3. THE Token_Service SHALL provide authorizeTrustLine function accepting TrustSet parameters
4. THE Token_Service SHALL provide clawbackToken function accepting Clawback parameters
5. THE Token_Service SHALL provide mintNFT function accepting NFTokenMint parameters
6. THE Token_Service SHALL provide createNFTOffer function accepting NFTokenCreateOffer parameters
7. THE Token_Service SHALL provide acceptNFTOffer function accepting NFTokenAcceptOffer parameters
8. THE Token_Service SHALL provide cancelNFTOffer function accepting NFTokenCancelOffer parameters
9. THE Token_Service SHALL provide burnNFT function accepting NFTokenBurn parameters
10. THE Token_Service SHALL provide createMPT function accepting MPTokenIssuanceCreate parameters
11. THE Token_Service SHALL provide authorizeMPT function accepting MPTokenAuthorize parameters
12. THE Token_Service SHALL provide distributeMPT function accepting Payment with MPT amount parameters
13. THE Token_Service SHALL provide destroyMPT function accepting MPTokenIssuanceDestroy parameters
14. FOR ALL Token_Service functions, THE Service SHALL return transaction field objects ready for submission
15. THE Token_Service SHALL accept client and wallet dependencies via constructor or function parameters

### Requirement 7: Credential Service Module

**User Story:** As a developer, I want a Credential Service module, so that I can perform Permissioned DEX credential operations through a consistent interface.

#### Acceptance Criteria

1. THE Credential_Service SHALL provide createCredential function accepting CredentialCreate parameters
2. THE Credential_Service SHALL provide acceptCredential function accepting CredentialAccept parameters
3. THE Credential_Service SHALL provide deleteCredential function accepting CredentialDelete parameters
4. THE Credential_Service SHALL provide queryCredentials function accepting account address
5. WHEN queryCredentials executes, THE Service SHALL call client.request with account_objects command and credential filter
6. FOR ALL Credential_Service transaction functions, THE Service SHALL return transaction field objects ready for submission
7. THE Credential_Service SHALL accept client and wallet dependencies via constructor or function parameters

### Requirement 8: Domain Service Module

**User Story:** As a developer, I want a Domain Service module, so that I can perform Permissioned Domain operations through a consistent interface.

#### Acceptance Criteria

1. THE Domain_Service SHALL provide createDomain function accepting PermissionedDomainSet parameters
2. THE Domain_Service SHALL provide updateDomain function accepting PermissionedDomainSet parameters
3. THE Domain_Service SHALL provide deleteDomain function accepting PermissionedDomainDelete parameters
4. THE Domain_Service SHALL provide queryDomains function accepting account address
5. WHEN queryDomains executes, THE Service SHALL call client.request with account_objects command and domain filter
6. FOR ALL Domain_Service transaction functions, THE Service SHALL return transaction field objects ready for submission
7. THE Domain_Service SHALL accept client and wallet dependencies via constructor or function parameters

### Requirement 9: DEX Service Module

**User Story:** As a developer, I want a DEX Service module, so that I can perform DEX and AMM operations through a consistent interface.

#### Acceptance Criteria

1. THE DEX_Service SHALL provide createOffer function accepting OfferCreate parameters including optional DomainID
2. THE DEX_Service SHALL provide cancelOffer function accepting OfferCancel parameters
3. THE DEX_Service SHALL provide queryOffers function accepting account address
4. WHEN queryOffers executes, THE Service SHALL call client.request with account_offers command
5. THE DEX_Service SHALL provide createAMM function accepting AMMCreate parameters
6. THE DEX_Service SHALL provide depositAMM function accepting AMMDeposit parameters
7. THE DEX_Service SHALL provide withdrawAMM function accepting AMMWithdraw parameters
8. THE DEX_Service SHALL provide voteAMM function accepting AMMVote parameters
9. THE DEX_Service SHALL provide bidAMM function accepting AMMBid parameters
10. FOR ALL DEX_Service transaction functions, THE Service SHALL return transaction field objects ready for submission
11. THE DEX_Service SHALL accept client and wallet dependencies via constructor or function parameters

### Requirement 10: Oracle Service Module

**User Story:** As a developer, I want an Oracle Service module, so that I can perform Oracle operations through a consistent interface.

#### Acceptance Criteria

1. THE Oracle_Service SHALL provide createOracle function accepting OracleSet parameters
2. THE Oracle_Service SHALL provide updateOracle function accepting OracleSet parameters
3. THE Oracle_Service SHALL provide deleteOracle function accepting OracleDelete parameters
4. THE Oracle_Service SHALL provide queryOracle function accepting oracle document ID
5. WHEN queryOracle executes, THE Service SHALL call client.request with ledger_entry command and oracle filter
6. FOR ALL Oracle_Service transaction functions, THE Service SHALL return transaction field objects ready for submission
7. THE Oracle_Service SHALL accept client and wallet dependencies via constructor or function parameters

### Requirement 11: Multi-Credential Issuance Batch Workflow

**User Story:** As a credential issuer, I want to create multiple credentials in parallel, so that I can efficiently onboard multiple subjects simultaneously.

#### Acceptance Criteria

1. THE XRPL_Client SHALL provide UI for entering multiple credential subjects and types
2. WHEN user initiates multi-credential issuance, THE Client SHALL create Tickets equal to credential count
3. WHEN Tickets are created, THE Client SHALL build CredentialCreate transactions for each subject using Ticket sequences
4. WHEN all transactions are built, THE Client SHALL submit the batch in parallel
5. THE Client SHALL display progress showing individual credential creation results
6. IF any credential creation fails, THEN THE Client SHALL report failure without blocking other credentials
7. THE Client SHALL record all credential transactions in transaction history

### Requirement 12: NFT Collection Minting Batch Workflow

**User Story:** As an NFT issuer, I want to mint multiple NFTs in parallel, so that I can efficiently create entire collections.

#### Acceptance Criteria

1. THE XRPL_Client SHALL provide UI for specifying NFT collection parameters (count, base URI, taxon, transfer fee)
2. WHEN user initiates collection minting, THE Client SHALL create Tickets equal to NFT count (up to 250)
3. WHEN Tickets are created, THE Client SHALL build NFTokenMint transactions for each NFT using Ticket sequences
4. WHEN all transactions are built, THE Client SHALL submit the batch in parallel
5. THE Client SHALL display progress showing individual NFT minting results
6. IF any NFT mint fails, THEN THE Client SHALL report failure without blocking other mints
7. THE Client SHALL record all mint transactions in transaction history
8. WHEN minting completes, THE Client SHALL display all created NFToken IDs

### Requirement 13: MPT Multi-Holder Authorization Batch Workflow

**User Story:** As an MPT issuer, I want to authorize multiple holders in parallel, so that I can efficiently enable token distribution.

#### Acceptance Criteria

1. THE XRPL_Client SHALL provide UI for entering multiple holder addresses for MPT authorization
2. WHEN user initiates multi-holder authorization, THE Client SHALL create Tickets equal to holder count
3. WHEN Tickets are created, THE Client SHALL build MPTokenAuthorize transactions for each holder using Ticket sequences
4. WHEN all transactions are built, THE Client SHALL submit the batch in parallel
5. THE Client SHALL display progress showing individual authorization results
6. IF any authorization fails, THEN THE Client SHALL report failure without blocking other authorizations
7. THE Client SHALL record all authorization transactions in transaction history

### Requirement 14: MPT Multi-Holder Distribution Batch Workflow

**User Story:** As an MPT issuer, I want to distribute tokens to multiple holders in parallel, so that I can efficiently execute airdrops or initial distributions.

#### Acceptance Criteria

1. THE XRPL_Client SHALL provide UI for entering multiple holder addresses and distribution amounts
2. WHEN user initiates multi-holder distribution, THE Client SHALL create Tickets equal to holder count
3. WHEN Tickets are created, THE Client SHALL build Payment transactions with MPT amounts for each holder using Ticket sequences
4. WHEN all transactions are built, THE Client SHALL submit the batch in parallel
5. THE Client SHALL display progress showing individual payment results
6. IF any payment fails, THEN THE Client SHALL report failure without blocking other payments
7. THE Client SHALL record all payment transactions in transaction history

### Requirement 15: Batch Offer Creation Workflow

**User Story:** As a trader, I want to create multiple DEX offers in parallel, so that I can efficiently establish market positions.

#### Acceptance Criteria

1. THE XRPL_Client SHALL provide UI for entering multiple offer pairs (TakerGets/TakerPays combinations)
2. WHEN user initiates batch offer creation, THE Client SHALL create Tickets equal to offer count
3. WHEN Tickets are created, THE Client SHALL build OfferCreate transactions for each pair using Ticket sequences
4. WHEN all transactions are built, THE Client SHALL submit the batch in parallel
5. THE Client SHALL display progress showing individual offer creation results
6. IF any offer creation fails, THEN THE Client SHALL report failure without blocking other offers
7. THE Client SHALL record all offer transactions in transaction history

### Requirement 16: Batch Offer Cancellation Workflow

**User Story:** As a trader, I want to cancel multiple DEX offers in parallel, so that I can efficiently close positions.

#### Acceptance Criteria

1. THE XRPL_Client SHALL provide UI for selecting multiple offers to cancel
2. WHEN user initiates batch offer cancellation, THE Client SHALL create Tickets equal to offer count
3. WHEN Tickets are created, THE Client SHALL build OfferCancel transactions for each offer using Ticket sequences
4. WHEN all transactions are built, THE Client SHALL submit the batch in parallel
5. THE Client SHALL display progress showing individual cancellation results
6. IF any cancellation fails, THEN THE Client SHALL report failure without blocking other cancellations
7. THE Client SHALL record all cancellation transactions in transaction history

### Requirement 17: Multi-TrustLine Setup Batch Workflow

**User Story:** As a token holder, I want to establish multiple trust lines in parallel, so that I can efficiently prepare my account for multiple token types.

#### Acceptance Criteria

1. THE XRPL_Client SHALL provide UI for entering multiple trust line specifications (currency, issuer, limit)
2. WHEN user initiates multi-trustline setup, THE Client SHALL create Tickets equal to trust line count
3. WHEN Tickets are created, THE Client SHALL build TrustSet transactions for each specification using Ticket sequences
4. WHEN all transactions are built, THE Client SHALL submit the batch in parallel
5. THE Client SHALL display progress showing individual trust line creation results
6. IF any trust line creation fails, THEN THE Client SHALL report failure without blocking other trust lines
7. THE Client SHALL record all trust line transactions in transaction history

### Requirement 18: Code Organization Structure

**User Story:** As a developer, I want clear code organization for transaction logic, so that I can easily locate and maintain transaction-related code.

#### Acceptance Criteria

1. THE XRPL_Client SHALL contain a src/services directory for domain service modules
2. THE XRPL_Client SHALL contain a src/hooks/transactions directory for transaction-related hooks
3. THE XRPL_Client SHALL contain a src/utils/batch.js module for batch utility functions
4. THE Token_Service SHALL be located at src/services/TokenService.js
5. THE Credential_Service SHALL be located at src/services/CredentialService.js
6. THE Domain_Service SHALL be located at src/services/DomainService.js
7. THE DEX_Service SHALL be located at src/services/DexService.js
8. THE Oracle_Service SHALL be located at src/services/OracleService.js
9. THE useTxBuilder Hook SHALL be located at src/hooks/transactions/useTxBuilder.js
10. THE useTxSubmit Hook SHALL be located at src/hooks/transactions/useTxSubmit.js
11. THE useTxBatch Hook SHALL be located at src/hooks/transactions/useTxBatch.js

### Requirement 19: Backward Compatibility Guarantee

**User Story:** As a developer, I want all existing transaction code to continue working, so that the refactor does not break existing functionality.

#### Acceptance Criteria

1. THE XRPL_Client SHALL maintain all existing page components without breaking changes
2. WHEN a page component uses direct submitAndWait calls, THE Client SHALL continue to execute those calls successfully
3. THE XrplContext SHALL maintain its existing API (xrpl, wallet, ensureConnected, addTx, connect, disconnect)
4. THE useMultisign Hook SHALL continue to function without modification
5. THE XRPL_Client SHALL support both legacy direct submission and new service/hook-based submission patterns
6. WHEN legacy code and new code coexist, THE Client SHALL execute both patterns without conflicts

### Requirement 20: Service Module Integration with XrplContext

**User Story:** As a developer, I want service modules to integrate with XrplContext, so that services have access to XRPL client and wallet without tight coupling.

#### Acceptance Criteria

1. WHEN a service function executes, THE Service SHALL accept xrpl client as a parameter
2. WHEN a service function executes, THE Service SHALL accept wallet object as a parameter
3. THE Service SHALL NOT directly import or depend on XrplContext
4. THE Service SHALL return plain transaction field objects without performing submission
5. THE Service SHALL validate required parameters and throw descriptive errors for missing fields
6. THE Service SHALL use xrpl library for formatting operations (xrpToDrops, convertStringToHex, etc.)

### Requirement 21: Transaction Builder Autofill Preservation

**User Story:** As a developer, I want transaction builders to preserve all provided fields during autofill, so that custom field values are not overwritten.

#### Acceptance Criteria

1. WHEN Transaction_Builder autofills a transaction, THE Builder SHALL preserve all fields provided by caller
2. WHEN Fee is provided, THE Builder SHALL NOT override the provided Fee value during autofill
3. WHEN Sequence is provided for single transactions, THE Builder SHALL NOT override the provided Sequence
4. WHEN TicketSequence is provided for batched transactions, THE Builder SHALL NOT override the provided TicketSeque nce
5. WHEN LastLedgerSequence is provided, THE Builder SHALL NOT override the provided LastLedgerSequence
6. THE Builder SHALL only fill missing required fields during autofill operation

### Requirement 22: Batch Transaction Fee Calculation

**User Story:** As a developer, I want accurate fee calculation for batched transactions, so that transactions do not fail due to insufficient fees.

#### Acceptance Criteria

1. WHEN building a batch, THE Batch_Workflow SHALL autofill each transaction individually to calculate base fees
2. WHEN TicketCreate transaction is built, THE Workflow SHALL use standard autofill for fee calculation
3. WHEN a batched transaction is submitted, THE Transaction SHALL use the autofilled Fee value
4. THE Batch_Workflow SHALL NOT apply multi-signature fee scaling for single-signature batches
5. IF batched transactions use multi-signature, THEN THE Workflow SHALL scale fees appropriately per transaction

### Requirement 23: Batch Progress Reporting

**User Story:** As a user, I want real-time progress reporting for batch operations, so that I can monitor long-running batch submissions.

#### Acceptance Criteria

1. WHEN a batch workflow starts, THE XRPL_Client SHALL display batch initialization status
2. WHEN Tickets are being created, THE Client SHALL display "Creating tickets" with progress indicator
3. WHEN transactions are being built, THE Client SHALL display "Building transactions" with count
4. WHEN batch submission starts, THE Client SHALL display "Submitting transactions" with progress
5. WHEN each transaction completes, THE Client SHALL update progress showing completed count and total count
6. WHEN batch completes, THE Client SHALL display summary with success count, failure count, and total count
7. THE Client SHALL display individual transaction results with success/failure indicators and hashes

### Requirement 24: Error Handling and Recovery

**User Story:** As a developer, I want comprehensive error handling for batch workflows, so that failures are graceful and informative.

#### Acceptance Criteria

1. IF TicketCreate fails, THEN THE Batch_Workflow SHALL abort batch execution and report ticket creation error
2. IF transaction build fails, THEN THE Workflow SHALL report build error with transaction index and continue building remaining transactions
3. IF transaction submission fails, THEN THE Workflow SHALL capture error message and continue submitting remaining transactions
4. THE Workflow SHALL report network failures distinctly from transaction validation failures
5. THE Workflow SHALL provide transaction-specific error messages for each failed transaction in batch
6. WHEN a partial batch succeeds, THE Client SHALL record successful transactions in history and report failures
7. THE Workflow SHALL NOT retry failed transactions automatically—user must manually retry

### Requirement 25: Service Module Testing Support

**User Story:** As a developer, I want service modules designed for testing, so that I can unit test transaction logic independently.

#### Acceptance Criteria

1. THE Service SHALL accept dependencies via parameters rather than hard-coded imports
2. THE Service SHALL return transaction objects rather than performing side effects (submission, state updates)
3. WHEN testing, THE Service SHALL accept mock xrpl client and wallet
4. THE Service SHALL throw synchronous errors for validation failures
5. THE Service SHALL NOT depend on React hooks or context
6. THE Service SHALL export pure functions or classes with dependency injection

### Requirement 26: Batch Workflow Transaction Ordering

**User Story:** As a developer, I want control over transaction ordering in batches, so that I can enforce dependencies when needed.

#### Acceptance Criteria

1. WHEN Tickets are used, THE Batch_Workflow SHALL assign Ticket sequences in the order transactions are provided
2. THE Workflow SHALL preserve transaction array order during batch building
3. WHEN batch submits, THE Workflow SHALL submit all transactions concurrently without guaranteed order
4. THE Workflow SHALL document that Ticket-based batches execute in parallel with no ordering guarantee
5. IF ordering is required, THEN THE developer SHALL use sequential single submissions instead of batching

### Requirement 27: Parser and Serializer Requirements for Batch Configurations

**User Story:** As a developer, I want to serialize and parse batch configurations, so that I can save and restore batch operation templates.

#### Acceptance Criteria

1. THE Batch_Configuration_Parser SHALL parse JSON batch configuration into transaction field objects
2. WHEN parsing batch configuration, THE Parser SHALL validate required fields for each transaction type
3. THE Batch_Configuration_Formatter SHALL format transaction field objects into JSON batch configuration
4. THE Formatter SHALL produce human-readable JSON with proper indentation
5. FOR ALL valid Batch_Configuration objects, parsing then formatting then parsing SHALL produce an equivalent object (round-trip property)
6. THE Parser SHALL return descriptive error messages for invalid configuration structure
7. THE Parser SHALL validate that transaction types are supported XRPL transaction types

### Requirement 28: Pretty Printer for Batch Configurations

**User Story:** As a developer, I want to pretty-print batch configurations, so that I can review and debug batch operations.

#### Acceptance Criteria

1. THE Pretty_Printer SHALL format batch configuration with consistent indentation
2. THE Pretty_Printer SHALL display transaction type, index, and key fields for each transaction
3. THE Pretty_Printer SHALL use 2-space indentation for JSON output
4. THE Pretty_Printer SHALL escape special characters in string fields
5. THE Pretty_Printer SHALL produce valid JSON that Parser can read

### Requirement 29: Batch Configuration Validation

**User Story:** As a developer, I want batch configuration validation, so that I can detect errors before submission.

#### Acceptance Criteria

1. THE Batch_Validator SHALL validate transaction type is a known XRPL transaction type
2. THE Validator SHALL validate required fields are present for each transaction type
3. THE Validator SHALL validate field types match XRPL specifications (string, number, object)
4. THE Validator SHALL validate addresses using xrpl.isValidAddress
5. THE Validator SHALL validate currency codes are 3-character or 40-character hex
6. THE Validator SHALL return array of validation errors with transaction index and field name
7. WHEN validation passes, THE Validator SHALL return empty error array

### Requirement 30: Documentation for Migration Path

**User Story:** As a developer, I want documentation explaining how to migrate from legacy patterns to new patterns, so that I can progressively refactor existing code.

#### Acceptance Criteria

1. THE XRPL_Client SHALL include migration guide document in project docs
2. THE Guide SHALL show side-by-side comparison of legacy submitAndWait pattern and new hook-based pattern
3. THE Guide SHALL provide example of converting IssuePage distribute function to use TokenService
4. THE Guide SHALL explain when to use batching versus single submission
5. THE Guide SHALL document service module APIs with parameter descriptions
6. THE Guide SHALL document hook APIs with state and function descriptions
7. THE Guide SHALL explain backward compatibility guarantees
