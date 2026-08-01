# Платежи и вывод

## Deposit webhook

- Подпись BlockBee (`verifier`).
- Lock deposit row + status → идемпотентный complete.
- Затем lock wallet + credit.

## Withdraw

- Списание REAL сразу в PENDING (нельзя проиграть held).
- Approve не списывает REAL повторно.
- Unique active pending.

## Idempotency

Deposit status machine + uuid/provider ids (см. код deposit).  
Bonus grant: рекомендуется idempotency на `deposit_id` (*улучшение*).
