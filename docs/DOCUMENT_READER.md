# Document reader playbook (hero feature)

ANVAYA’s first shippable feature: **read bills and documents** for blind and low-vision users. The model does not dump the page. It names the paper, then speaks the facts that let someone act.

Spoken shape:

1. What it is (+ issuer if visible)
2. Amount due and/or deadline (or the equivalent critical fact)
3. One next action or one extra field (late fee, overdue, appointment time)

Never invent numbers. Last 4 digits only for accounts and IDs. No medical, legal, or financial advice.

## Bills

| Paper | What ANVAYA leads with | Then (if visible) |
|---|---|---|
| Electricity, water, gas, broadband, mobile, DTH | Amount due, due date | Last 4 of consumer no., late fee, disconnect date |
| Credit card statement | Amount due, due date | Minimum due if different; overdue |
| Loan / EMI / mortgage | EMI or installment, due date | Overdue |
| Insurance premium | Amount, due date | Lapse / grace warning |
| Hospital / clinic / pharmacy bill | Total payable, date | Patient name — no diagnosis interpretation |
| Rent / society / HOA | Amount, period or due date | Payee |
| Tax / GST / property / income-tax notice | What it is, amount, due or hearing date | Printed action |
| School / college fee | Amount, due date | Student name |
| Subscription / gym invoice | Amount, period or renewal | — |

## Other documents

| Paper | What ANVAYA leads with | Then (if visible) |
|---|---|---|
| Receipt | Paid amount, date, merchant | Short reference |
| Invoice | Total, due date | From / to |
| Payslip | Net pay, period | Employer — skip allowance dump |
| Cheque | Payee, amount, date | Unsigned if blank signature |
| Courier label | Recipient, tracking last 4 | Delivery type |
| Train / bus / flight / event ticket | Where, date-time | PNR or seat |
| Appointment slip | Who/what, date, time, place | — |
| Form / KYC | Form name | What to fill or sign |
| Official letter | From whom, the ask, deadline | — |
| ID (Aadhaar, PAN, passport, licence) | Type + name | Expiry; **never** full ID number |
| Prescription | Names + printed directions only | No extra medical advice |
| Medicine label | Product, strength | Printed warnings only |
| Menu | Venue + a few items with prices | Not the whole menu |
| Contract first page | Title, parties, deadline | No unseen-page legal summary |
| Admit card | Exam, date/time, centre | Roll last 4 |
| Warranty leaflet | Product + one instruction or helpline | — |

## How the user runs it

- **Talk** → “Read this” (or most other utterances default to Read)
- **Capture & hear** (no mic) — default mode is Read
- **Simplify** — First / Then / Finally on the same page
- **Ask** — “what is the amount due?” / “is it overdue?”

If the photo is dark, cropped, or blurry, ANVAYA says how to recapture, then reads whatever is still visible.

Prompts live in [`backend/app/document_playbook.py`](../backend/app/document_playbook.py).
