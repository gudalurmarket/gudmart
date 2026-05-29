export const translations = {
  // GROUP 1 — Week state names (7 keys)
  'week.state.setup': { en: 'Setup', ta: 'அமைப்பு' },
  'week.state.open': { en: 'Open for Orders', ta: 'ஆர்டர்களுக்கு திறந்தது' },
  'week.state.locked': { en: 'Orders Locked', ta: 'ஆர்டர்கள் பூட்டப்பட்டது' }, // TA: REVIEW REQUIRED
  'week.state.delivery': { en: 'Delivery', ta: 'விநியோகம்' },
  'week.state.market_day': { en: 'Market Day', ta: 'சந்தை நாள்' },
  'week.state.reconciliation': { en: 'Reconciliation', ta: 'பரிசீலனை / சமரசம்' }, // TA: REVIEW REQUIRED
  'week.state.closed': { en: 'Closed', ta: 'முடிந்தது' },

  // GROUP 2 — State transition action buttons (6 keys)
  'transition.setup_to_open.button': { en: 'Publish Week', ta: 'வாரத்தை வெளியிடு' },
  'transition.open_to_locked.button': { en: 'Lock Orders', ta: 'ஆர்டர்களை பூட்டு' },
  'transition.locked_to_delivery.button': { en: 'Confirm Produce Arrived', ta: 'விளைவு வந்ததை உறுதி செய்' },
  'transition.delivery_to_market_day.button': { en: 'Open Market Day', ta: 'சந்தை நாளை திற' },
  'transition.market_day_to_reconciliation.button': { en: 'Open Reconciliation', ta: 'பரிசீலனை/சமரசத்தைத் திற' },
  'transition.reconciliation_to_closed.button': { en: 'Close Week', ta: 'வாரத்தை மூடு' },

  // GROUP 3 — Transition confirmation dialogs (title + body for each of 6 transitions)
  'transition.setup_to_open.confirm_title': { en: 'Publish this week?', ta: 'இந்த வாரத்தை வெளியிடவா?' },
  'transition.setup_to_open.confirm_body': {
    en: 'This will move the week to “Open for Orders”. The produce list must have at least 1 item.',
    ta: 'இந்த வாரம் “ஆர்டர்களுக்கு திறந்தது” நிலைக்கு செல்லும். விளைவு பட்டியலில் குறைந்தது 1 உருப்பு இருக்க வேண்டும்.'
  },

  'transition.open_to_locked.confirm_title': { en: 'Lock all orders?', ta: 'அனைத்து ஆர்டர்களையும் பூட்டவா?' },
  'transition.open_to_locked.confirm_body': {
    en: 'This will move the week to “Orders Locked” and prevent further order confirmations. Any pending payment orders must be resolved first.',
    ta: 'இந்த நடவடிக்கை வாரத்தை “ஆர்டர்கள் பூட்டப்பட்டது” நிலைக்கு மாற்றும் மற்றும் மேலும் ஆர்டர் உறுதிப்படுத்தலை நிறுத்தும். நிலுவையில் உள்ள கட்டண ஆர்டர்களை முதலில் தீர்க்க வேண்டும்.'
  },

  'transition.locked_to_delivery.confirm_title': { en: 'Confirm produce arrived?', ta: 'விளைவு வந்ததை உறுதி செய்யவா?' },
  'transition.locked_to_delivery.confirm_body': {
    en: 'Proceed to “Delivery” so volunteers can enter delivered quantities.',
    ta: '“விநியோகம்” நிலைக்கு செல்லுங்கள்; தன்னார்வலர்கள் வழங்கப்பட்ட அளவுகளை உள்ளிடலாம்.'
  },

  'transition.delivery_to_market_day.confirm_title': { en: 'Open market day?', ta: 'சந்தை நாளை திறக்கவா?' },
  'transition.delivery_to_market_day.confirm_body': {
    en: 'Proceed to “Market Day” so dispatch and walk-in sales can start.',
    ta: '“சந்தை நாள்” நிலைக்கு செல்லுங்கள்; அனுப்பல் மற்றும் நுழைவு விற்பனைகள் தொடங்கலாம்.'
  },

  'transition.market_day_to_reconciliation.confirm_title': { en: 'Open reconciliation?', ta: 'பரிசீலனை/சமரசத்தைத் திறக்கவா?' },
  'transition.market_day_to_reconciliation.confirm_body': {
    en: 'Proceed to “Reconciliation” to confirm price differences and record farmer payments.',
    ta: '“பரிசீலனை/சமரசம்” நிலைக்கு செல்லுங்கள்; விலை வேறுபாடுகளை உறுதி செய்து விவசாயி பணப்பதிவுகளை பதிவு செய்யலாம்.'
  },

  'transition.reconciliation_to_closed.confirm_title': { en: 'Close this week?', ta: 'இந்த வாரத்தை மூடவா?' },
  'transition.reconciliation_to_closed.confirm_body': {
    en: 'This will finalize the week. You must confirm all price differences, set outstation farmer payment statuses, and record all local farmer payments.',
    ta: 'இது வாரத்தை இறுதி செய்யும். எல்லா விலை வேறுபாடுகளையும் உறுதி செய்யவும்; வெளிநகர் விவசாயி பண நிலையை அமைக்கவும்; அனைத்து உள்ளூர் விவசாயி பணப்பதிவுகளையும் பதிவு செய்யவும்.'
  },

  // GROUP 4 — Gate blocker messages (5 keys)
  'blocker.pending_payment_orders': {
    en: 'Pending Payment orders must be resolved before locking.',
    ta: 'பூட்டுவதற்கு முன் “நிலுவை கட்டணம்” உள்ள ஆர்டர்கள் தீர்க்கப்பட வேண்டும்.'
  },
  'blocker.empty_produce_list': {
    en: 'Produce list must contain at least 1 item to publish the week.',
    ta: 'வாரத்தை வெளியிட விளைவு பட்டியலில் குறைந்தது 1 உருப்பு இருக்க வேண்டும்.'
  },
  'blocker.unconfirmed_price_differences': {
    en: 'All price differences must be confirmed before closing the week.',
    ta: 'வாரத்தை மூடுவதற்கு முன் அனைத்து விலை வேறுபாடுகளும் உறுதி செய்யப்பட வேண்டும்.'
  },
  'blocker.unpaid_farmer_assignments': {
    en: 'Outstation farmer payments must be recorded for all farmers who delivered this week.',
    ta: 'இந்த வாரம் விளைவு வழங்கிய அனைத்து வெளிநகர் விவசாயிகளுக்கும் பணப்பதிவுகள் பதிவு செய்யப்பட வேண்டும்.'
  },
  'blocker.unrecorded_local_payments': {
    en: 'Local farmer payments must be recorded for all local farmers before closing.',
    ta: 'வாரத்தை மூடுவதற்கு முன் அனைத்து உள்ளூர் விவசாயிகளுக்கும் பணப்பதிவுகள் பதிவு செய்யப்பட வேண்டும்.'
  },

  // GROUP 5 — Order status labels (6 keys)
  'order.status.pending_payment': { en: 'Pending Payment', ta: 'கட்டணம் நிலுவையில்' }, // TA: REVIEW REQUIRED
  'order.status.confirmed': { en: 'Confirmed', ta: 'உறுதி செய்யப்பட்டது' },
  'order.status.cancelled': { en: 'Cancelled', ta: 'ரத்து செய்யப்பட்டது' },
  'order.status.packed': { en: 'Packed', ta: 'பேக் செய்யப்பட்டது' },
  'order.status.dispatched': { en: 'Dispatched', ta: 'அனுப்பப்பட்டது' },
  'order.status.delivered': { en: 'Delivered', ta: 'வழங்கப்பட்டது' },

  // GROUP 5b — Order management screen
  'order.filter.all': { en: 'All', ta: 'All' },
  'order.filter.confirmed': { en: 'Confirmed', ta: 'Confirmed' },
  'order.filter.pending_payment': { en: 'Pending Payment', ta: 'Pending Payment' },
  'order.filter.cancelled': { en: 'Cancelled', ta: 'Cancelled' },
  'order.search.placeholder': { en: 'Search by name…', ta: 'Search by name…' },
  'order.empty_state': { en: 'No orders found', ta: 'No orders found' },
  'order.pending_payment_empty': { en: 'No pending payment orders', ta: 'No pending payment orders' },
  'order.shortfall_label': { en: 'Shortfall', ta: 'Shortfall' },
  'order.read_only_notice': { en: 'Orders are read-only in this state', ta: 'Orders are read-only in this state' },
  'order.edit.title': { en: 'Edit Order', ta: 'Edit Order' },
  'order.cancel.confirm_title': { en: 'Cancel Order', ta: 'Cancel Order' },
  'order.cancel.confirm_body': {
    en: 'This order will be cancelled and the wallet will be credited.',
    ta: 'This order will be cancelled and the wallet will be credited.',
  },
  'order.summary.title': { en: 'Order Summary', ta: 'Order Summary' },
  'order.confirm_via_topup_tooltip': {
    en: 'Record a wallet top-up first — confirmed automatically when balance covers the order',
    ta: 'Record a wallet top-up first — confirmed automatically when balance covers the order',
  },
  'action.edit_order': { en: 'Edit Order', ta: 'Edit Order' },
  'action.cancel_order': { en: 'Cancel Order', ta: 'Cancel Order' },
  'action.confirm_order': { en: 'Confirm Order', ta: 'Confirm Order' },
  'action.add_line_item': { en: 'Add Item', ta: 'Add Item' },
  'status.confirmed': { en: 'Confirmed', ta: 'Confirmed' },
  'status.pending_payment': { en: 'Pending Payment', ta: 'Pending Payment' },
  'status.cancelled': { en: 'Cancelled', ta: 'Cancelled' },
  'status.packed': { en: 'Packed', ta: 'பேக் செய்யப்பட்டது' },

  // GROUP 6 — Wallet entry type labels (8 keys, from PRD Section 7.2)
  'wallet.type.top_up': { en: 'Top-up', ta: 'டாப்-அப்' }, // TA: REVIEW REQUIRED
  'wallet.type.order_debit': { en: 'Order Debit', ta: 'ஆர்டர் டெபிட்' },
  'wallet.type.order_debit_reversal': { en: 'Order Debit Reversal', ta: 'ஆர்டர் டெபிட் ரிவர்சல்' }, // TA: REVIEW REQUIRED
  'wallet.type.price_diff_credit': { en: 'Price Difference Credit', ta: 'விலை வேறுபாடு கிரெடிட்' },
  'wallet.type.price_diff_debit': { en: 'Price Difference Debit', ta: 'விலை வேறுபாடு டெபிட்' },
  'wallet.type.customer_due': { en: 'Customer Due', ta: 'வாடிக்கையாளர் நிலுவை' },
  'wallet.type.balance_payment': { en: 'Balance Payment', ta: 'இறுதி கட்டண பைமென்ட்' }, // TA: REVIEW REQUIRED
  'wallet.type.manual_adjustment': { en: 'Manual Adjustment', ta: 'கைமுறை சரிசெய்தல்' },

  // GROUP 6b — Wallet management screen
  'wallet.page_title': { en: 'Wallet Management', ta: 'வாலெட் மேலாண்மை' },
  'wallet.customer_search.placeholder': { en: 'Search customers…', ta: 'வாடிக்கையாளர்களை தேடுங்கள்…' },
  'wallet.no_customers': { en: 'No customers found', ta: 'வாடிக்கையாளர்கள் இல்லை' },
  'wallet.current_balance': { en: 'Current Balance', ta: 'தற்போதைய இருப்பு' },
  'wallet.topup.title': { en: 'Record Top-Up', ta: 'டாப்-அப் பதிவு செய்' },
  'wallet.topup.amount_label': { en: 'Amount (₹)', ta: 'தொகை (₹)' },
  'wallet.topup.amount_placeholder': { en: '0', ta: '0' },
  'wallet.topup.channel_label': { en: 'Payment Channel', ta: 'கட்டண வழி' },
  'wallet.topup.reference_label': { en: 'UPI Reference', ta: 'யுபிஐ குறிப்பு' },
  'wallet.topup.reference_placeholder': { en: 'e.g. UPI ref 8821', ta: 'எ.கா. UPI ref 8821' },
  'wallet.topup.submit_button': { en: 'Record Top-Up', ta: 'டாப்-அப் பதிவு செய்' },
  'wallet.topup_not_available': {
    en: 'Top-ups are not available in this state',
    ta: 'இந்த நிலையில் டாப்-அப் செய்ய முடியாது',
  },
  'wallet.pending_orders_now_coverable': {
    en: 'Wallet now covers pending order(s). Go to Order Management to confirm.',
    ta: 'வாலெட் இப்போது நிலுவை ஆர்டர்களை மறைக்கிறது. உறுதி செய்ய ஆர்டர் மேலாண்மைக்கு செல்லுங்கள்.',
  },
  'wallet.go_to_orders': { en: 'View Pending Orders', ta: 'நிலுவை ஆர்டர்களை பார்' },
  'wallet.ledger.title': { en: 'Ledger', ta: 'பதிவேடு' },
  'wallet.ledger.running_balance': { en: 'Balance', ta: 'இருப்பு' },
  'wallet.ledger.empty': { en: 'No transactions yet', ta: 'பரிவர்த்தனைகள் இல்லை' },
  'wallet.channel.cash': { en: 'Cash', ta: 'பணம்' },
  'wallet.channel.upi': { en: 'UPI', ta: 'யுபிஐ' },
  'txn.type.top_up': { en: 'Top-Up', ta: 'டாப்-அப்' },
  'txn.type.order_debit': { en: 'Order Debit', ta: 'ஆர்டர் டெபிட்' },
  'txn.type.order_debit_reversal': { en: 'Order Reversal', ta: 'ஆர்டர் திரும்பப்பெறுதல்' },
  'txn.type.price_diff_credit': { en: 'Price Adjustment (Credit)', ta: 'விலை சரிசெய்தல் (கிரெடிட்)' },
  'txn.type.price_diff_debit': { en: 'Price Adjustment (Debit)', ta: 'விலை சரிசெய்தல் (டெபிட்)' },
  'txn.type.customer_due': { en: 'Customer Due', ta: 'வாடிக்கையாளர் நிலுவை' },
  'txn.type.balance_payment': { en: 'Balance Payment', ta: 'இறுதி கட்டணம்' },
  'txn.type.manual_adjustment': { en: 'Manual Adjustment', ta: 'கைமுறை சரிசெய்தல்' },
  'channel.cash': { en: 'Cash', ta: 'பணம்' },
  'channel.upi': { en: 'UPI', ta: 'யுபிஐ' },
  'channel.system': { en: 'System', ta: 'கணினி' },

  // GROUP 7 — Payment channel labels (3 keys)
  'payment.channel.cash': { en: 'Cash', ta: 'பணம்' },
  'payment.channel.upi': { en: 'UPI', ta: 'யுபிஐ' }, // TA: REVIEW REQUIRED
  'payment.channel.system': { en: 'System', ta: 'கணினி' }, // TA: REVIEW REQUIRED

  // GROUP 8 — Parse status labels (6 keys)
  'parse.status.clean': { en: 'Clean', ta: 'தெளிவானது' }, // TA: REVIEW REQUIRED
  'parse.status.partial': { en: 'Partial', ta: 'பகுதி' }, // TA: REVIEW REQUIRED
  'parse.status.manual_required': { en: 'Manual Entry Required', ta: 'கைமுறை உள்ளீடு தேவை' },
  'parse.status.voice_note': { en: 'Voice Note', ta: 'குரல் குறிப்பு' },
  'parse.status.image': { en: 'Image', ta: 'படம்' },
  'parse.status.no_active_week': { en: 'No active week — manual review required', ta: 'செயலில் இருக்கும் வாரம் இல்லை — கைமுறை சரிபார்ப்பு தேவை' },
  'parse.status.unknown_sender': { en: 'Unknown sender', ta: 'அறியாத அனுப்புநர்' },

  // GROUP 9 — Farmer type labels (2 keys)
  'farmer.type.outstation': { en: 'Outstation', ta: 'வெளிநகர்' }, // TA: REVIEW REQUIRED
  'farmer.type.local': { en: 'Local', ta: 'உள்ளூர்' },

  // GROUP 10 — Farmer payment status labels (3 keys)
  'farmer.payment.status.unpaid': { en: 'Unpaid', ta: 'செலுத்தப்படவில்லை' },
  'farmer.payment.status.partial': { en: 'Partial', ta: 'பகுதி செலுத்தப்பட்டது' },
  'farmer.payment.status.paid': { en: 'Paid', ta: 'செலுத்தப்பட்டது' },

  // GROUP 11 — Common action buttons
  'action.mark_packed': { en: 'Mark Packed', ta: 'பேக் செய்யப்பட்டது என குறி' },
  'filter.unpacked_only': { en: 'Show unpacked only', ta: 'பேக் செய்யாதவை மட்டும்' },
  'filter.show_all': { en: 'Show all', ta: 'அனைத்தும் காட்டு' },
  'action.confirm': { en: 'Confirm', ta: 'உறுதி செய்' },
  'action.cancel': { en: 'Cancel', ta: 'ரத்து செய்' },
  'action.edit': { en: 'Edit', ta: 'திருத்து' },
  'action.delete': { en: 'Delete', ta: 'அழி' },
  'action.save': { en: 'Save', ta: 'சேமி' },
  'action.approve': { en: 'Approve', ta: 'அங்கீகரி' }, // TA: REVIEW REQUIRED
  'action.reject': { en: 'Reject', ta: 'நிராகரி' }, // TA: REVIEW REQUIRED
  'action.add': { en: 'Add', ta: 'சேர்' },
  'action.close': { en: 'Close', ta: 'மூடு' },
  'action.back': { en: 'Back', ta: 'மீண்டும்' }, // TA: REVIEW REQUIRED
  'action.search': { en: 'Search', ta: 'தேடு' },
  'action.copy_to_clipboard': { en: 'Copy to clipboard', ta: 'கிளிப்போர்டுக்கு நகலெடு' }, // TA: REVIEW REQUIRED
  'action.copy': { en: 'Copy', ta: 'நகலெடு' },
  'action.copied': { en: 'Copied', ta: 'நகலெடுக்கப்பட்டது' },

  // GROUP 12 — Navigation labels (operator screens)
  'nav.dashboard': { en: 'Dashboard', ta: 'டாஷ்போர்டு' }, // TA: REVIEW REQUIRED
  'nav.week_setup': { en: 'Week Setup', ta: 'வார அமைப்பு' },
  'nav.order_intake': { en: 'Order Intake', ta: 'ஆர்டர் பெறுதல்' },
  'nav.order_management': { en: 'Order Management', ta: 'ஆர்டர் மேலாண்மை' },
  'nav.wallet_management': { en: 'Wallet Management', ta: 'வாலெட் மேலாண்மை' },
  'nav.delivery_management': { en: 'Delivery Management', ta: 'டெலிவரி மேலாண்மை' },
  'nav.market_day': { en: 'Market Day', ta: 'சந்தை நாள்' },
  'nav.reconciliation': { en: 'Reconciliation', ta: 'பரிசீலனை' }, // TA: REVIEW REQUIRED
  'nav.weekly_summary': { en: 'Weekly Summary', ta: 'வார சுருக்கம்' },
  'nav.registrations': { en: 'Registrations', ta: 'பதிவுகள்' },

  // GROUP 13 — Navigation labels (volunteer screens)
  'nav.volunteer.delivery_entry': { en: 'Delivery Entry', ta: 'டெலிவரி பதிவேடு' }, // TA: REVIEW REQUIRED
  'nav.volunteer.packing_list': { en: 'Packing List', ta: 'பேக்கிங் பட்டியல்' },
  'nav.volunteer.dispatch': { en: 'Dispatch', ta: 'அனுப்பல்' },

  // GROUP 14 — Error messages (one per named error class in CLAUDE.md Section 8)
  'error.wallet_insufficient': {
    en: 'Wallet balance is insufficient for this action.',
    ta: 'இந்த நடவடிக்கைக்கான வாலெட் இருப்பு போதவில்லை.'
  },
  'error.action_not_permitted_in_state': {
    en: 'This action is not permitted in the current week state.',
    ta: 'இந்த நடவடிக்கை தற்போதைய வார நிலைத்தில் அனுமதிக்கப்படவில்லை.'
  },
  'error.transition_gate_blocked': {
    en: 'This transition cannot proceed due to blockers. Resolve them and try again.',
    ta: 'தடைகள் காரணமாக இந்த மாற்றம் தொடர முடியாது. அவற்றை தீர்த்து மீண்டும் முயற்சிக்கவும்.'
  },
  'error.duplicate_message': { en: 'This message was already received.', ta: 'இந்த செய்தி ஏற்கனவே பெறப்பட்டது.' },
  'error.unknown_sender': {
    en: 'Sender is not recognised. Register the customer to continue.',
    ta: 'அனுப்புநர் அடையாளம் காணப்படவில்லை. தொடர வாடிக்கையாளரை பதிவு செய்யுங்கள்.'
  },
  'error.week_not_found': { en: 'Week not found.', ta: 'வாரம் கிடைக்கவில்லை.' },
  'error.order_not_found': { en: 'Order not found.', ta: 'ஆர்டர் கிடைக்கவில்லை.' },
  'error.customer_not_found': { en: 'Customer not found.', ta: 'வாடிக்கையாளர் கிடைக்கவில்லை.' },
  'error.duplicate_phone': { en: 'This phone number is already registered.', ta: 'இந்த தொலைபேசி எண் ஏற்கனவே பதிவு செய்யப்பட்டிருக்கிறது.' },
  'error.wallet_duplicate_operation': {
    en: 'This wallet operation is a duplicate.',
    ta: 'இந்த வாலெட் நடவடிக்கை நகல் (duplicate).'
  },
  'error.forbidden': { en: 'Forbidden.', ta: 'அனுமதி இல்லை.' },
  'error.unauthorised': { en: 'Unauthorised.', ta: 'அங்கீகாரம் இல்லை.' },
  'error.network_error': {
    en: 'Cannot reach the server. Check that the API is running and refresh.',
    ta: 'சர்வரை அடைய முடியவில்லை. API இயங்குகிறதா என சரிபார்த்து புதுப்பிக்கவும்.'
  },
  'error.validation': {
    en: 'Invalid request. Please check your input and try again.',
    ta: 'தவறான கோரிக்கை. உள்ளீட்டை சரிபார்த்து மீண்டும் முயற்சிக்கவும்.'
  },
  'error.internal': {
    en: 'Server error. Please try again in a moment.',
    ta: 'சர்வர் பிழை. சிறிது நேரத்தில் மீண்டும் முயற்சிக்கவும்.'
  },
  'error.unknown': { en: 'Unknown error. Please try again.', ta: 'தெரியாத பிழை. மீண்டும் முயற்சிக்கவும்.' },

  // GROUP 15 — Toast / success messages
  'toast.order_confirmed': { en: 'Order confirmed.', ta: 'ஆர்டர் உறுதி செய்யப்பட்டது.' },
  'toast.order_cancelled': { en: 'Order cancelled.', ta: 'ஆர்டர் ரத்து செய்யப்பட்டது.' },
  'toast.order_approved': { en: 'Order approved.', ta: 'ஆர்டர் அங்கீகரிக்கப்பட்டது.' },
  'toast.order_rejected': { en: 'Order rejected.', ta: 'ஆர்டர் நிராகரிக்கப்பட்டது.' },
  'toast.order_reverted_pending_payment': {
    en: 'Order saved as Pending Payment — wallet balance insufficient.',
    ta: 'ஆர்டர் "கட்டணம் நிலுவையில்" என சேமிக்கப்பட்டது — வாலெட் இருப்பு போதவில்லை.'
  },
  'toast.topup_recorded': { en: 'Top-up recorded.', ta: 'டாப்-அப் பதிவு செய்யப்பட்டது.' }, // TA: REVIEW REQUIRED
  'toast.week_state_changed': { en: 'Week state updated.', ta: 'வார நிலை புதுப்பிக்கப்பட்டது.' },
  'toast.price_difference_confirmed': { en: 'Price difference confirmed.', ta: 'விலை வேறுபாடு உறுதி செய்யப்பட்டது.' },
  'toast.farmer_payment_recorded': { en: 'Farmer payment recorded.', ta: 'விவசாயி பணப்பதிவு பதிவு செய்யப்பட்டது.' },
  'toast.local_farmer_payment_recorded': { en: 'Local farmer payment recorded.', ta: 'உள்ளூர் விவசாயி பணப்பதிவு பதிவு செய்யப்பட்டது.' },
  'toast.delivery_qty_saved': { en: 'Delivery quantity saved.', ta: 'விநியோக அளவு சேமிக்கப்பட்டது.' },
  'toast.order_packed': { en: 'Order packed.', ta: 'ஆர்டர் பேக் செய்யப்பட்டது.' },
  'toast.order_dispatched': { en: 'Order dispatched.', ta: 'ஆர்டர் அனுப்பப்பட்டது.' },
  'toast.walkin_sale_recorded': { en: 'Walk-in sale recorded.', ta: 'நுழைவு விற்பனை பதிவு செய்யப்பட்டது.' },
  'toast.local_farmer_inbound_recorded': { en: 'Local farmer inbound recorded.', ta: 'உள்ளூர் விவசாயி வரத்து பதிவு செய்யப்பட்டது.' },
  'toast.week_closed': { en: 'Week closed.', ta: 'வாரம் மூடப்பட்டது.' },
  'toast.copied_to_clipboard': { en: 'Copied to clipboard.', ta: 'கிளிப்போர்டுக்கு நகலெடுக்கப்பட்டது.' },
  'toast.fcfs_reallocation': { en: 'FCFS allocation updated.', ta: 'FCFS ஒதுக்கீடு புதுப்பிக்கப்பட்டது.' }, // TA: REVIEW REQUIRED
  'toast.assignment_saved': { en: 'Assignment saved', ta: 'ஒதுக்கீடு சேமிக்கப்பட்டது' },
  'toast.fcfs_reallocated': {
    en: 'FCFS reallocation triggered',
    ta: 'FCFS மறு ஒதுக்கீடு தொடங்கியது',
  },
  'toast.order_updated': { en: 'Order updated', ta: 'Order updated' },
  'toast.wallet_insufficient': { en: 'Wallet balance is insufficient', ta: 'Wallet balance is insufficient' },
  'toast.wallet_credited': { en: 'credited back to wallet', ta: 'credited back to wallet' },
  'toast.balance_payment_recorded': {
    en: 'Balance payment recorded',
    ta: 'மீதி கட்டணம் பதிவு செய்யப்பட்டது',
  },
  'toast.inbound_recorded': { en: 'Inbound recorded', ta: 'வரத்து பதிவு செய்யப்பட்டது' },
  'toast.walkin_recorded': { en: 'Walk-in sale recorded', ta: 'நுழைவு விற்பனை பதிவு செய்யப்பட்டது' },

  // GROUP 15b — Market day screen
  'market_day.read_only_notice': {
    en: 'Market day actions are not available in this state',
    ta: 'இந்த நிலையில் சந்தை நாள் செயல்கள் கிடைக்காது',
  },
  'market_day.tab.balance': { en: 'Balance Payments', ta: 'மீதி கட்டணங்கள்' },
  'market_day.tab.inbound': { en: 'Local Farmer Inbound', ta: 'உள்ளூர் விவசாயி வரத்து' },
  'market_day.tab.walkin': { en: 'Walk-in Sales', ta: 'நுழைவு விற்பனை' },
  'market_day.balance_due_label': { en: 'Balance Due', ta: 'மீதம் நிலுவை' },
  'market_day.order_value_label': { en: 'Order value', ta: 'ஆர்டர் மதிப்பு' },
  'market_day.payment_amount_label': { en: 'Amount (₹)', ta: 'தொகை (₹)' },
  'market_day.record_payment_button': { en: 'Record Payment', ta: 'கட்டணம் பதிவு செய்' },
  'market_day.no_balance_due': {
    en: 'No outstanding balance payments',
    ta: 'நிலுவையில் மீதி கட்டணங்கள் இல்லை',
  },
  'market_day.no_local_farmers': {
    en: 'No local farmers registered',
    ta: 'உள்ளூர் விவசாயிகள் பதிவு செய்யப்படவில்லை',
  },
  'market_day.inbound_form_title': { en: 'Record Inbound', ta: 'வரத்து பதிவு செய்' },
  'market_day.inbound_qty_label': { en: 'Quantity', ta: 'அளவு' },
  'market_day.inbound_price_label': { en: 'Price per unit (₹)', ta: 'அலகு விலை (₹)' },
  'market_day.inbound_submit_button': { en: 'Record Inbound', ta: 'வரத்து பதிவு செய்' },
  'market_day.no_inbound_records': { en: 'No inbound records yet', ta: 'இன்னும் வரத்து பதிவுகள் இல்லை' },
  'market_day.item_label': { en: 'Item', ta: 'பொருள்' },
  'market_day.add_new_item': {
    en: 'Add as new item: "{{name}}"',
    ta: 'புதிய பொருளாக சேர்: "{{name}}"',
  },
  'market_day.walkin_form_title': { en: 'Record Walk-in Sale', ta: 'நுழைவு விற்பனை பதிவு' },
  'market_day.walkin_qty_label': { en: 'Qty Sold', ta: 'விற்ற அளவு' },
  'market_day.walkin_amount_label': { en: 'Amount Collected (₹)', ta: 'வசூலித்த தொகை (₹)' },
  'market_day.walkin_submit_button': { en: 'Record Sale', ta: 'விற்பனை பதிவு' },
  'market_day.walkin_farmer_label': { en: 'Local Farmer', ta: 'உள்ளூர் விவசாயி' },
  'market_day.walkin_customer_name_label': { en: 'Customer Name', ta: 'வாடிக்கையாளர் பெயர்' },
  'market_day.walkin_customer_phone_label': { en: 'Phone', ta: 'தொலைபேசி' },
  'market_day.record_customer_details': {
    en: 'Record customer details?',
    ta: 'வாடிக்கையாளர் விவரங்களை பதிவு செய்யவா?',
  },
  'market_day.no_walkin_sales': {
    en: 'No walk-in sales recorded',
    ta: 'நுழைவு விற்பனைகள் பதிவு செய்யப்படவில்லை',
  },
  'market_day.total_cash': { en: 'Total Cash', ta: 'மொத்த பணம்' },
  'market_day.total_upi': { en: 'Total UPI', ta: 'மொத்த UPI' },
  'market_day.source.outstation': { en: 'Outstation', ta: 'வெளிநகர்' },
  'market_day.source.local_farmer': { en: 'Local Farmer', ta: 'உள்ளூர் விவசாயி' },
  'market_day.inventory_source_label': { en: 'Inventory Source', ta: 'சரக்கு மூலம்' },

  // GROUP 16 — Form field labels and placeholders (operator forms)
  'field.customer_name': { en: 'Customer Name', ta: 'வாடிக்கையாளர் பெயர்' },
  'field.customer_name.placeholder': { en: 'Enter customer name', ta: 'வாடிக்கையாளர் பெயரை உள்ளிடுங்கள்' },
  'field.phone_number': { en: 'Phone Number', ta: 'தொலைபேசி எண்' },
  'field.phone_number.placeholder': { en: 'Enter phone number', ta: 'தொலைபேசி எண்ணை உள்ளிடுங்கள்' },
  'field.amount': { en: 'Amount', ta: 'தொகை' },
  'field.amount.placeholder': { en: 'Enter amount', ta: 'தொகையை உள்ளிடுங்கள்' },
  'field.channel': { en: 'Payment Channel', ta: 'பணம் செலுத்தும் வழி' },
  'field.reference_note': { en: 'Reference Note', ta: 'குறிப்பு' },
  'field.reference_note.placeholder': { en: 'Enter reference note (optional)', ta: 'குறிப்பை உள்ளிடுங்கள் (விருப்பம்)' },
  'field.product': { en: 'Product', ta: 'பொருள்' },
  'field.quantity': { en: 'Quantity', ta: 'அளவு' },
  'field.unit': { en: 'Unit', ta: 'அலகு' },
  'field.price_per_unit': { en: 'Price per Unit', ta: 'ஒரு அலகிற்கு விலை' },
  'field.price_per_unit.placeholder': { en: 'Enter price per unit', ta: 'ஒரு அலகிற்கு விலையை உள்ளிடுங்கள்' },
  'field.buffer_percent': { en: 'Buffer %', ta: 'பஃபர் %' },
  'field.buffer_percent.placeholder': { en: 'Enter buffer percent', ta: 'பஃபர் சதவீதத்தை உள்ளிடுங்கள்' },
  'field.notes': { en: 'Notes', ta: 'குறிப்புகள்' },
  'field.notes.placeholder': { en: 'Enter notes', ta: 'குறிப்புகளை உள்ளிடுங்கள்' },
  'field.market_date': { en: 'Market Date', ta: 'சந்தை தேதி' },
  'field.product_name_en': { en: 'Product Name (English)', ta: 'பொருள் பெயர் (ஆங்கிலம்)' },
  'field.product_name_ta': { en: 'Product Name (Tamil)', ta: 'பொருள் பெயர் (தமிழ்)' },
  'field.default_unit': { en: 'Default Unit', ta: 'இயல்புநிலை அலகு' },
  'field.farmer_name': { en: 'Farmer Name', ta: 'விவசாயி பெயர்' },
  'field.farmer_location': { en: 'Farmer Location', ta: 'விவசாயி இடம்' },
  'field.farmer_type': { en: 'Farmer Type', ta: 'விவசாயி வகை' },

  // GROUP 17 — Unit type labels (4 keys)
  'unit.kg': { en: 'kg', ta: 'கிலோ' },
  'unit.piece': { en: 'piece', ta: 'துண்டு' }, // TA: REVIEW REQUIRED
  'unit.bunch': { en: 'bunch', ta: 'கொத்து' }, // TA: REVIEW REQUIRED
  'unit.100g': { en: '100g', ta: '100 கிராம்' },

  // GROUP 18 — Empty state messages
  'empty.intake_queue': { en: 'No messages in the intake queue.', ta: 'உள்ளீட்டு வரிசையில் செய்தி எதுவும் இல்லை.' },
  'empty.order_list': { en: 'No orders found.', ta: 'ஆர்டர்கள் எதுவும் இல்லை.' },
  'empty.packing_list': { en: 'No orders to pack.', ta: 'பேக் செய்ய ஆர்டர்கள் இல்லை.' },
  'empty.delivery_list': { en: 'No delivery entries yet.', ta: 'இதுவரை விநியோக பதிவுகள் இல்லை.' },
  'empty.wallet_ledger': { en: 'Wallet ledger is empty.', ta: 'வாலெட் பதிவேடு காலியாக உள்ளது.' },
  'empty.produce_list': { en: 'Produce list is empty.', ta: 'விளைவு பட்டியல் காலியாக உள்ளது.' },
  'empty.farmer_list': { en: 'No farmers found.', ta: 'விவசாயிகள் எதுவும் இல்லை.' },
  'empty.customer_list': { en: 'No customers found.', ta: 'வாடிக்கையாளர்கள் எதுவும் இல்லை.' },
  'empty.reconciliation_list': { en: 'No items to reconcile.', ta: 'பரிசீலிக்க எதுவும் இல்லை.' },
  'empty.walkin_sales': { en: 'No walk-in sales found.', ta: 'நுழைவு விற்பனைகள் எதுவும் இல்லை.' },
  'empty.dispatch_list': { en: 'No packed orders to dispatch yet.', ta: 'இன்னும் அனுப்ப பேக் செய்யப்பட்ட ஆர்டர்கள் இல்லை.' },

  // GROUP 19 — SSE / connectivity status
  'sse.status.connected': { en: 'Connected', ta: 'இணைக்கப்பட்டது' },
  'sse.status.reconnecting': { en: 'Reconnecting', ta: 'மீண்டும் இணைக்கிறது' },
  'sse.status.polling_fallback': { en: 'Polling fallback', ta: 'போலிங் மாற்று முறை' }, // TA: REVIEW REQUIRED
  'offline.banner': {
    en: 'You are offline. Changes will be saved when you reconnect.',
    ta: 'நீங்கள் ஆஃப்லைனில் உள்ளீர்கள். மீண்டும் இணைந்ததும் மாற்றங்கள் சேமிக்கப்படும்.'
  },
  'offline.form_queued': {
    en: 'Saved locally. Will sync when back online.',
    ta: 'உள்ளூராக சேமிக்கப்பட்டது. மீண்டும் ஆன்லைனில் வந்ததும் ஒத்திசையும்.'
  },

  // GROUP 20 — Intake queue specific labels
  'intake.unknown_customer': { en: 'Unknown customer', ta: 'அறியாத வாடிக்கையாளர்' },
  'intake.parse_status_label': { en: 'Parse status', ta: 'பகுப்பாய்வு நிலை' }, // TA: REVIEW REQUIRED
  'intake.original_message_label': { en: 'Original message', ta: 'அசல் செய்தி' },
  'intake.parsed_preview_label': { en: 'Parsed preview', ta: 'பகுக்கப்பட்ட முன்நோக்கு' }, // TA: REVIEW REQUIRED
  'intake.fcfs_timestamp_label': { en: 'FCFS timestamp', ta: 'FCFS நேரமுத்திரை' }, // TA: REVIEW REQUIRED
  'intake.voice_note_instruction': {
    en: 'Voice note — manual entry required.',
    ta: 'குரல் குறிப்பு — கைமுறை உள்ளீடு தேவை.'
  },
  'intake.image_instruction': {
    en: 'Image — manual entry required.',
    ta: 'படம் — கைமுறை உள்ளீடு தேவை.'
  },
  'intake.no_active_week_instruction': {
    en: 'No active week — manual review required.',
    ta: 'செயலில் இருக்கும் வாரம் இல்லை — கைமுறை சரிபார்ப்பு தேவை.'
  },
  'intake.add_line_item': { en: 'Add line item', ta: 'வரி உருப்படியைச் சேர்' },
  'intake.remove_line_item': { en: 'Remove line item', ta: 'வரி உருப்படியை அகற்று' },
  'intake.shortfall_amount': { en: 'Shortfall amount', ta: 'குறைவு தொகை' }, // TA: REVIEW REQUIRED
  'intake.not_open': {
    en: 'The intake queue is only available when the week is open for orders.',
    ta: 'வாரம் ஆர்டர்களுக்கு திறந்திருக்கும்போது மட்டுமே உள்ளீட்டு வரிசை கிடைக்கும்.'
  },
  'intake.register_customer': {
    en: 'Register customer',
    ta: 'வாடிக்கையாளரை பதிவு செய்'
  },
  'intake.validation.line_items': {
    en: 'Add at least one line item with product, quantity, and unit.',
    ta: 'பொருள், அளவு மற்றும் அலகுடன் குறைந்தது ஒரு வரி உருப்படியைச் சேர்க்கவும்.'
  },

  // GROUP 21 — Packing / dispatch labels (volunteer screens)
  'packing.fcfs_rank_label': { en: 'FCFS Rank', ta: 'FCFS தரவரிசை' }, // TA: REVIEW REQUIRED
  'packing.ordered_qty_label': { en: 'Ordered Qty', ta: 'ஆர்டர் அளவு' },
  'packing.customer_label': { en: 'Customer', ta: 'வாடிக்கையாளர்' },
  'packing.shortfall_badge': { en: 'Shortfall', ta: 'குறைவு' },
  'packing.fcfs_rank_prefix': { en: '#', ta: '#' },
  'packing.all_packed': { en: 'All orders are packed!', ta: 'அனைத்து ஆர்டர்களும் பேக் செய்யப்பட்டன!' },
  'packing.not_available_in_state': {
    en: 'The packing list is only available when the week is in Delivery state.',
    ta: 'வாரம் விநியோக நிலையில் இருக்கும்போது மட்டுமே பேக்கிங் பட்டியல் கிடைக்கும்.',
  },
  'dispatch.balance_due_label': { en: 'Balance Due', ta: 'மீதம் நிலுவை' }, // TA: REVIEW REQUIRED
  'dispatch.balance_cleared_label': { en: 'Balance Cleared', ta: 'மீதம் முடிந்தது' }, // TA: REVIEW REQUIRED
  'dispatch.search_placeholder': { en: 'Search by customer name…', ta: 'வாடிக்கையாளர் பெயரால் தேடுங்கள்…' },
  'dispatch.direct_to_operator': { en: 'Please direct customer to operator for payment', ta: 'தயவு செய்து வாடிக்கையாளரை கட்டணத்திற்கு ஆபரேட்டரிடம் அனுப்புங்கள்' }, // TA: REVIEW REQUIRED
  'dispatch.section_pending': { en: 'Pending', ta: 'நிலுவையில்' },
  'dispatch.section_completed': { en: 'Completed', ta: 'முடிந்தவை' },
  'dispatch.remaining_count': { en: '{count} remaining', ta: '{count} மீதமுள்ளது' }, // TA: REVIEW REQUIRED
  'dispatch.all_dispatched': { en: 'All orders dispatched!', ta: 'அனைத்து ஆர்டர்களும் அனுப்பப்பட்டன!' },
  'dispatch.not_available_in_state': { en: 'Dispatch is only available on Market Day.', ta: 'சந்தை நாளில் மட்டுமே அனுப்பல் கிடைக்கும்.' },
  'dispatch.no_results': { en: 'No orders match your search.', ta: 'உங்கள் தேடலுக்கு பொருந்தும் ஆர்டர்கள் இல்லை.' },
  'action.mark_dispatched': { en: 'Mark Dispatched', ta: 'அனுப்பப்பட்டது என குறி' },
  'status.dispatched': { en: 'Dispatched', ta: 'அனுப்பப்பட்டது' },
  'delivery.read_only_notice': {
    en: 'Delivery data is read-only in this state',
    ta: 'இந்த நிலையில் விநியோக தரவு படிக்க மட்டுமே',
  },
  'delivery.total_ordered': { en: 'ordered', ta: 'ஆர்டர் செய்யப்பட்டது' },
  'delivery.buffer_pct_label': { en: 'Buffer %', ta: 'பஃபர் %' },
  'delivery.outgoing_qty_label': { en: 'Outgoing', ta: 'வெளியேற்றம்' },
  'delivery.farmer_assignments_label': { en: 'Farmer Assignments', ta: 'விவசாயி ஒதுக்கீடுகள்' },
  'delivery.add_farmer_assignment': { en: 'Add Farmer', ta: 'விவசாயியைச் சேர்' },
  'delivery.assignment_variance_warning': {
    en: 'Assignment total does not match outgoing qty',
    ta: 'ஒதுக்கீடு மொத்தம் வெளியேற்ற அளவுடன் பொருந்தவில்லை',
  },
  'delivery.farmer_order_export_title': { en: 'Farmer Order Summary', ta: 'விவசாயி ஆர்டர் சுருக்கம்' },
  'delivery.expected_qty_label': { en: 'Expected', ta: 'எதிர்பார்க்கப்படும்' },
  'delivery.tab_delivered_quantities': { en: 'Delivered Quantities', ta: 'வழங்கிய அளவுகள்' },
  'delivery.tab_packing_list': { en: 'Packing List', ta: 'பேக்கிங் பட்டியல்' },
  'delivery.delivered_qty_label': { en: 'Delivered Qty', ta: 'வழங்கிய அளவு' },
  'delivery.shortfall_flag': { en: 'Shortfall', ta: 'குறைவு' },
  'delivery.overdelivery_flag': { en: 'Overdelivery', ta: 'அதிக விநியோகம்' }, // TA: REVIEW REQUIRED
  'delivery.packing_list_empty': { en: 'No packing data yet', ta: 'இன்னும் பேக்கிங் தரவு இல்லை' },
  'delivery.packing_col_product': { en: 'Product', ta: 'பொருள்' },
  'delivery.packing_col_ordered': { en: 'Ordered', ta: 'ஆர்டர்' },
  'delivery.packing_col_allocated': { en: 'Allocated', ta: 'ஒதுக்கப்பட்டது' },
  'delivery.full_delivery': { en: 'Full delivery', ta: 'முழு விநியோகம்' },
  'delivery.pending_sync': { en: 'Pending sync', ta: 'ஒத்திசைவு நிலுவையில்' },
  'delivery.not_available_in_state': {
    en: 'Delivery entry is only available when the week is in Delivery state.',
    ta: 'வாரம் விநியோக நிலையில் இருக்கும்போது மட்டுமே விநியோக பதிவேடு கிடைக்கும்.',
  },
  'delivery.fcfs_allocation_title': { en: 'FCFS Allocation', ta: 'FCFS ஒதுக்கீடு' },

  // GROUP 22 — WhatsApp copyable templates
  // (Mark all Tamil values: // TA: CONFIRM WITH OPERATOR IN C5 SESSION)
  'template.produce_list.header': {
    en: 'Gudalur Organic Market\nProduce List for the week of {{marketDate}}\n',
    ta: 'கூடலூர் ஆர்கானிக் சந்தை\nஇந்த வார விளைவு பட்டியல் ({{marketDate}})\n',
  }, // TA: CONFIRM WITH OPERATOR IN C5 SESSION
  'template.produce_list.item_line': {
    en: '{{productName}} - {{pricePerUnit}} per {{unit}}\n',
    ta: '{{productName}} - {{pricePerUnit}} ஒரு {{unit}} க்கு\n',
  }, // TA: CONFIRM WITH OPERATOR IN C5 SESSION
  'template.produce_list.footer': {
    en: '\nTo order, reply with item name + quantity + unit. Thank you.',
    ta: '\nஆர்டர் செய்ய, பொருள் பெயர் + அளவு + அலகுடன் பதிலளிக்கவும். நன்றி.',
  }, // TA: CONFIRM WITH OPERATOR IN C5 SESSION

  'template.farmer_order.header': {
    en: 'Order for Outstation Farmer: {{farmerName}}\nMarket Week: {{marketDate}}\n',
    ta: 'வெளிநகர் விவசாயிக்கான ஆர்டர்: {{farmerName}}\nசந்தை வாரம்: {{marketDate}}\n',
  }, // TA: CONFIRM WITH OPERATOR IN C5 SESSION
  'template.farmer_order.item_line': {
    en: '{{productName}} - {{outgoingQty}} {{unit}}\n',
    ta: '{{productName}} - {{outgoingQty}} {{unit}}\n',
  }, // TA: CONFIRM WITH OPERATOR IN C5 SESSION
  'template.farmer_order.footer': {
    en: '\nPlease dispatch the listed quantity to the collection point.',
    ta: '\nகுறிப்பிட்ட அளவை சேகரிப்பு இடத்திற்கு அனுப்பவும்.',
  }, // TA: CONFIRM WITH OPERATOR IN C5 SESSION

  'template.order_summary.header': {
    en: 'Order Summary for {{customerName}}\nMarket Week: {{marketDate}}\n',
    ta: 'வாடிக்கையாளருக்கான ஆர்டர் சுருக்கம்: {{customerName}}\nசந்தை வாரம்: {{marketDate}}\n',
  }, // TA: CONFIRM WITH OPERATOR IN C5 SESSION
  'template.order_summary.item_line': {
    en: '{{productName}} - {{quantity}} {{unit}}\n',
    ta: '{{productName}} - {{quantity}} {{unit}}\n',
  }, // TA: CONFIRM WITH OPERATOR IN C5 SESSION
  'template.order_summary.footer': {
    en: '\nTotal: {{totalAmount}}. Please confirm.',
    ta: '\nமொத்தம்: {{totalAmount}}. தயவு செய்து உறுதி செய்யவும்.',
  }, // TA: CONFIRM WITH OPERATOR IN C5 SESSION

  // GROUP 23 — Language toggle
  'lang.toggle_label': { en: 'Language', ta: 'மொழி' },
  'lang.english': { en: 'English', ta: 'ஆங்கிலம்' },
  'lang.tamil': { en: 'Tamil', ta: 'தமிழ்' },

  // GROUP 24 — Week summary labels
  'summary.page_title': { en: 'Weekly Summary', ta: 'வார சுருக்கம்' },
  'summary.not_yet_available': {
    en: 'The weekly summary is not available until the week is closed',
    ta: 'வாரம் மூடப்படும் வரை வார சுருக்கம் கிடைக்காது', // TA: REVIEW REQUIRED
  },
  'summary.not_generated_yet': {
    en: 'Summary not yet generated — close the week to generate it',
    ta: 'சுருக்கம் இன்னும் உருவாக்கப்படவில்லை — உருவாக்க வாரத்தை மூடவும்', // TA: REVIEW REQUIRED
  },
  'summary.opening_balance_title': { en: 'Opening Balance', ta: 'தொடக்க இருப்பு' },
  'summary.receipts_title': { en: 'Receipts', ta: 'வருவாய்' }, // TA: REVIEW REQUIRED
  'summary.total_receipts': { en: 'Total Receipts', ta: 'மொத்த வருவாய்' }, // TA: REVIEW REQUIRED
  'summary.expenses_title': { en: 'Expenses', ta: 'செலவுகள்' }, // TA: REVIEW REQUIRED
  'summary.outstation_farmer_expenses': { en: 'Outstation Farmers', ta: 'வெளிநகர் விவசாயிகள்' }, // TA: REVIEW REQUIRED
  'summary.local_farmer_expenses': { en: 'Local Farmers', ta: 'உள்ளூர் விவசாயிகள்' }, // TA: REVIEW REQUIRED
  'summary.total_expenses': { en: 'Total Expenses', ta: 'மொத்த செலவுகள்' }, // TA: REVIEW REQUIRED
  'summary.wallet_adjustments_title': { en: 'Wallet Adjustments', ta: 'வாலெட் சரிசெய்தல்கள்' }, // TA: REVIEW REQUIRED
  'summary.wallet_adjustments_note': {
    en: 'Informational only — not included in closing balance',
    ta: 'தகவல் மட்டும் — முடிவு இருப்பில் சேர்க்கப்படவில்லை', // TA: REVIEW REQUIRED
  },
  'summary.price_diff_credits': { en: 'Shortfall Credits', ta: 'குறைவு கிரெடிட்கள்' }, // TA: REVIEW REQUIRED
  'summary.price_diff_debits': { en: 'Overdelivery Debits', ta: 'அதிக விநியோக டெபிட்கள்' }, // TA: REVIEW REQUIRED
  'summary.outstanding_title': { en: 'Outstanding Items', ta: 'நிலுவை உருப்படிகள்' }, // TA: REVIEW REQUIRED
  'summary.no_outstanding_items': {
    en: 'No outstanding items this week',
    ta: 'இந்த வாரம் நிலுவை உருப்படிகள் இல்லை', // TA: REVIEW REQUIRED
  },
  'summary.closing_balance_title': { en: 'Closing Balance', ta: 'முடிவு இருப்பு' },
  'summary.carry_forward_note': {
    en: "Use these figures as next week's opening balance",
    ta: 'இந்த எண்களை அடுத்த வாரத்தின் தொடக்க இருப்பாக பயன்படுத்தவும்', // TA: REVIEW REQUIRED
  },
  'summary.generated_at': { en: 'Generated', ta: 'உருவாக்கப்பட்டது' }, // TA: REVIEW REQUIRED
  'summary.opening_balance': { en: 'Opening Balance', ta: 'தொடக்க இருப்பு' },
  'summary.preorder_receipts': { en: 'Preorder Receipts', ta: 'முன்பதிவு வருவாய்' },
  'summary.market_day_receipts': { en: 'Market Day Receipts', ta: 'சந்தை நாள் வருவாய்' },
  'summary.walkin_receipts': { en: 'Walk-in Sales Receipts', ta: 'நுழைவு விற்பனை வருவாய்' },
  'summary.wallet_credits': { en: 'Wallet Credits', ta: 'வாலெட் கிரெடிட்கள்' },
  'summary.wallet_debits': { en: 'Wallet Debits', ta: 'வாலெட் டெபிட்கள்' },
  'summary.outstation_farmer_paid': { en: 'Outstation Farmer Paid', ta: 'வெளிநகர் விவசாயி செலுத்தப்பட்டது' },
  'summary.local_farmer_paid': { en: 'Local Farmer Paid', ta: 'உள்ளூர் விவசாயி செலுத்தப்பட்டது' },
  'summary.outstanding_farmer_liabilities': { en: 'Outstanding Farmer Liabilities', ta: 'நிலுவையில் உள்ள விவசாயி பொறுப்புகள்' }, // TA: REVIEW REQUIRED
  'summary.outstanding_customer_dues': { en: 'Outstanding Customer Dues', ta: 'நிலுவையில் உள்ள வாடிக்கையாளர் கடன்கள்' }, // TA: REVIEW REQUIRED
  'summary.closing_balance': { en: 'Closing Balance', ta: 'முடிவு இருப்பு' },
  'summary.cash_label': { en: 'Cash', ta: 'பணம்' },
  'summary.bank_label': { en: 'Bank (UPI)', ta: 'வங்கி (யுபிஐ)' }, // TA: REVIEW REQUIRED
  'summary.total_label': { en: 'Total', ta: 'மொத்தம்' },

  // GROUP 25 — Reconciliation screen
  'reconciliation.tab_price_differences': { en: 'Price Differences', ta: 'விலை வேறுபாடுகள்' }, // TA: REVIEW REQUIRED
  'reconciliation.tab_outstation_payments': { en: 'Outstation Payments', ta: 'வெளிநகர் கட்டணங்கள்' }, // TA: REVIEW REQUIRED
  'reconciliation.tab_local_payments': { en: 'Local Payments', ta: 'உள்ளூர் கட்டணங்கள்' }, // TA: REVIEW REQUIRED
  'reconciliation.tab_delivery_edit': { en: 'Delivery Edit', ta: 'விநியோக திருத்தம்' }, // TA: REVIEW REQUIRED
  'reconciliation.read_only_notice': { en: 'Reconciliation actions are not available in this state', ta: 'இந்த நிலையில் பரிசீலனை செயல்கள் கிடைக்காது' }, // TA: REVIEW REQUIRED
  'reconciliation.unconfirmed_count': { en: 'Unconfirmed', ta: 'உறுதிப்படுத்தப்படாதவை' }, // TA: REVIEW REQUIRED
  'reconciliation.farmers_unpaid_count': { en: 'Farmers unpaid', ta: 'விவசாயிகள் செலுத்தப்படவில்லை' }, // TA: REVIEW REQUIRED
  'reconciliation.local_farmers_unpaid_count': { en: 'Local farmers unpaid', ta: 'உள்ளூர் விவசாயிகள் செலுத்தப்படவில்லை' }, // TA: REVIEW REQUIRED
  'reconciliation.confirmed_section_header': { en: 'Confirmed', ta: 'உறுதிப்படுத்தப்பட்டவை' }, // TA: REVIEW REQUIRED
  'reconciliation.shortfall_label': { en: 'Shortfall', ta: 'குறைவு' },
  'reconciliation.overdelivery_label': { en: 'Overdelivery', ta: 'அதிக விநியோகம்' }, // TA: REVIEW REQUIRED
  'reconciliation.credit_label': { en: 'Credit to customer', ta: 'வாடிக்கையாளருக்கு கிரெடிட்' }, // TA: REVIEW REQUIRED
  'reconciliation.debit_label': { en: 'Debit from customer', ta: 'வாடிக்கையாளரிடமிருந்து டெபிட்' }, // TA: REVIEW REQUIRED
  'reconciliation.confirm_difference_button': { en: 'Confirm', ta: 'உறுதி செய்' },
  'reconciliation.difference_confirmed': { en: 'Confirmed', ta: 'உறுதிப்படுத்தப்பட்டது' },
  'reconciliation.no_differences': { en: 'No price differences this week', ta: 'இந்த வாரம் விலை வேறுபாடுகள் இல்லை' }, // TA: REVIEW REQUIRED
  'reconciliation.amount_due_label': { en: 'Amount Due', ta: 'செலுத்த வேண்டிய தொகை' }, // TA: REVIEW REQUIRED
  'reconciliation.amount_paid_label': { en: 'Amount Paid', ta: 'செலுத்திய தொகை' }, // TA: REVIEW REQUIRED
  'reconciliation.outstanding_label': { en: 'Outstanding', ta: 'நிலுவை' }, // TA: REVIEW REQUIRED
  'reconciliation.record_payment_button': { en: 'Record Payment', ta: 'கட்டணம் பதிவு செய்' },
  'reconciliation.edit_payment_button': { en: 'Edit Payment', ta: 'கட்டணம் திருத்து' }, // TA: REVIEW REQUIRED
  'reconciliation.sold_qty_label': { en: 'Sold Qty', ta: 'விற்ற அளவு' }, // TA: REVIEW REQUIRED
  'reconciliation.unsold_qty_label': { en: 'Unsold', ta: 'விற்காத' }, // TA: REVIEW REQUIRED
  'reconciliation.record_local_farmer_payment_button': { en: 'Record Payment', ta: 'கட்டணம் பதிவு செய்' },
  'reconciliation.local_farmer_payment_not_available': {
    en: 'Payment recording not yet available for this farmer',
    ta: 'இந்த விவசாயிக்கான கட்டண பதிவு இன்னும் கிடைக்கவில்லை',
  }, // TA: REVIEW REQUIRED
  'reconciliation.correction_window_closed': {
    en: 'Correction window closed — a price difference has already been confirmed',
    ta: 'திருத்த சாளரம் மூடப்பட்டது — ஒரு விலை வேறுபாடு ஏற்கனவே உறுதிப்படுத்தப்பட்டது',
  }, // TA: REVIEW REQUIRED

  // GROUP 26 — Farmer payment status (operator-facing, separate from farmer.payment.status)
  'payment.status.unpaid': { en: 'Unpaid', ta: 'செலுத்தப்படவில்லை' },
  'payment.status.partial': { en: 'Partial', ta: 'பகுதி செலுத்தப்பட்டது' },
  'payment.status.paid': { en: 'Paid', ta: 'செலுத்தப்பட்டது' },

  // GROUP 27 — Reconciliation toasts
  'toast.customer_due_created': {
    en: 'Customer Due recorded — collect at next interaction',
    ta: 'வாடிக்கையாளர் நிலுவை பதிவு செய்யப்பட்டது — அடுத்த சந்திப்பில் வசூலிக்கவும்',
  }, // TA: REVIEW REQUIRED
  'toast.farmer_payment_saved': { en: 'Farmer payment saved', ta: 'விவசாயி கட்டணம் சேமிக்கப்பட்டது' }, // TA: REVIEW REQUIRED
  'toast.local_farmer_payment_saved': { en: 'Local farmer payment saved', ta: 'உள்ளூர் விவசாயி கட்டணம் சேமிக்கப்பட்டது' }, // TA: REVIEW REQUIRED
  'toast.delivered_qty_updated': { en: 'Delivered quantity updated', ta: 'வழங்கிய அளவு புதுப்பிக்கப்பட்டது' }, // TA: REVIEW REQUIRED

  'action.loading': { en: 'Loading...', ta: 'ஏற்றுகிறது...' },
  'action.reload': { en: 'Reload', ta: 'மீண்டும் ஏற்று' },
  'error.boundary.title': { en: 'Something went wrong', ta: 'ஏதோ தவறு நடந்தது' },
  'error.boundary.body': { en: 'Please refresh the page.', ta: 'பக்கத்தை புதுப்பிக்கவும்.' },

  'app.name': { en: 'Gudalur Organic Market', ta: 'கூடலூர் ஆர்கானிக் சந்தை' },

  // GROUP 28 — Registration screens
  'registration.customer.title': { en: 'Customer Registration', ta: 'வாடிக்கையாளர் பதிவு' },
  'registration.customer.add_button': { en: 'Add Customer', ta: 'வாடிக்கையாளரை சேர்' },
  'registration.customer.name_label': { en: 'Name', ta: 'பெயர்' },
  'registration.customer.phone_label': { en: 'Phone', ta: 'தொலைபேசி' },
  'registration.customer.opening_balance_label': { en: 'Opening Wallet Balance (₹)', ta: 'தொடக்க வாலெட் இருப்பு (₹)' },
  'registration.customer.duplicate_phone_error': { en: 'This phone number is already registered', ta: 'இந்த தொலைபேசி எண் ஏற்கனவே பதிவு செய்யப்பட்டிருக்கிறது' },
  'registration.farmer.title': { en: 'Farmer Registration', ta: 'விவசாயி பதிவு' },
  'registration.farmer.add_button': { en: 'Add Farmer', ta: 'விவசாயியை சேர்' },
  'registration.farmer.name_label': { en: 'Name', ta: 'பெயர்' },
  'registration.farmer.phone_label': { en: 'Phone', ta: 'தொலைபேசி' },
  'registration.farmer.location_label': { en: 'Location / Village', ta: 'இடம் / கிராமம்' },
  'registration.farmer.type_label': { en: 'Farmer Type', ta: 'விவசாயி வகை' },
  'registration.farmer.type_outstation': { en: 'Outstation', ta: 'வெளிநகர்' },
  'registration.farmer.type_local': { en: 'Local', ta: 'உள்ளூர்' },
  'registration.farmer.duplicate_phone_error': { en: 'This phone number is already registered', ta: 'இந்த தொலைபேசி எண் ஏற்கனவே பதிவு செய்யப்பட்டிருக்கிறது' },
  'registration.catalogue.title': { en: 'Catalogue Management', ta: 'பட்டியல் மேலாண்மை' },
  'registration.catalogue.add_button': { en: 'Add Item', ta: 'பொருளை சேர்' },
  'registration.catalogue.name_en_label': { en: 'English Name', ta: 'ஆங்கில பெயர்' },
  'registration.catalogue.name_ta_label': { en: 'Tamil Name', ta: 'தமிழ் பெயர்' },
  'registration.catalogue.unit_label': { en: 'Default Unit', ta: 'இயல்புநிலை அலகு' },
  'registration.deactivate_label': { en: 'Deactivate', ta: 'செயலிழக்கு' },
  'registration.reactivate_label': { en: 'Reactivate', ta: 'மீண்டும் செயல்படுத்து' },
  'registration.confirm_deactivate_label': { en: 'Tap again to confirm', ta: 'உறுதிப்படுத்த மீண்டும் தட்டவும்' },
  'status.active': { en: 'Active', ta: 'செயலில்' },
  'status.inactive': { en: 'Inactive', ta: 'செயலற்றது' },
  'registration.customer.show_inactive': { en: 'Show inactive', ta: 'செயலற்றவர்களை காட்டு' },
  'registration.farmer.show_inactive': { en: 'Show inactive', ta: 'செயலற்றவர்களை காட்டு' },
  'registration.catalogue.show_inactive': { en: 'Show inactive', ta: 'செயலற்றவற்றை காட்டு' },
  'registration.filter.all': { en: 'All', ta: 'அனைத்தும்' },
  'registration.farmer.type_edit_disabled_hint': { en: 'Type cannot be changed after registration', ta: 'பதிவிற்கு பிறகு வகையை மாற்ற முடியாது' },
  'registration.save_success_customer': { en: 'Customer saved.', ta: 'வாடிக்கையாளர் சேமிக்கப்பட்டார்.' },
  'registration.save_success_farmer': { en: 'Farmer saved.', ta: 'விவசாயி சேமிக்கப்பட்டார்.' },
  'registration.save_success_product': { en: 'Product saved.', ta: 'பொருள் சேமிக்கப்பட்டது.' },
  'nav.customers': { en: 'Customers', ta: 'வாடிக்கையாளர்கள்' },
  'nav.farmers': { en: 'Farmers', ta: 'விவசாயிகள்' },
  'nav.catalogue': { en: 'Catalogue', ta: 'பட்டியல்' },
  'login.title': { en: 'Sign in', ta: 'உள்நுழை' },
  'login.email': { en: 'Email', ta: 'மின்னஞ்சல்' },
  'login.email.placeholder': { en: 'Enter your email', ta: 'உங்கள் மின்னஞ்சலை உள்ளிடுங்கள்' },
  'login.password': { en: 'Password', ta: 'கடவுச்சொல்' },
  'login.password.placeholder': { en: 'Enter your password', ta: 'உங்கள் கடவுச்சொல்லை உள்ளிடுங்கள்' },
  'login.submit': { en: 'Sign in', ta: 'உள்நுழை' },
  'login.error': { en: 'Invalid email or password.', ta: 'தவறான மின்னஞ்சல் அல்லது கடவுச்சொல்.' },
};

