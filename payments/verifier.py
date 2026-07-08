import base64

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_public_key

from pathlib import Path
import requests
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from log_manager import log


PUBLIC_KEY_PATH = Path("payments/blockbee_public.pem")


def load_public_key():

    # Если ключ уже скачан
    if PUBLIC_KEY_PATH.exists():
        log.info("Loading BlockBee public key from local file")
        return load_pem_public_key(
            PUBLIC_KEY_PATH.read_bytes()
        )

    # Первый запуск
    log.info("Downloading BlockBee public key from API")
    try:
        response = requests.get(
            "https://api.blockbee.io/pubkey/",
            timeout=10
        )
        data = response.json()
        pem = data['pubkey'].replace("\\n", "\n")

        response.raise_for_status()

        PUBLIC_KEY_PATH.write_text(
            pem,
            encoding="utf-8"
        )

        log.info("BlockBee public key downloaded and saved")
        return load_pem_public_key(
            pem.encode("utf-8")
        )
    except Exception:
        log.exception("Failed to load BlockBee public key")
        raise

PUBLIC_KEY = load_public_key()

class BlockBeeVerifier:

    @staticmethod
    async def verify(request):

        signature_b64 = request.headers.get("x-ca-signature")

        if signature_b64 is None:
            log.warning("BlockBee webhook missing signature header")
            return False

        try:
            signature = base64.b64decode(signature_b64)

            body = await request.body()

            PUBLIC_KEY.verify(
                signature,
                body,
                padding.PKCS1v15(),
                hashes.SHA256()
            )

            log.info("BlockBee webhook signature verified successfully")
            return True

        except Exception:
            log.exception("BlockBee webhook signature verification failed")
            return False
