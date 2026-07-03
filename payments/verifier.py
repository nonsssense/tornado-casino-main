import base64

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_public_key

from pathlib import Path
import requests
from cryptography.hazmat.primitives.serialization import load_pem_public_key


PUBLIC_KEY_PATH = Path("payments/blockbee_public.pem")


def load_public_key():

    # Если ключ уже скачан
    if PUBLIC_KEY_PATH.exists():
        return load_pem_public_key(
            PUBLIC_KEY_PATH.read_bytes()
        )

    # Первый запуск
    response = requests.get(
        "https://api.blockbee.io/pubkey/",
        timeout=10
    )

    response.raise_for_status()

    PUBLIC_KEY_PATH.write_bytes(
        response.content
    )

    return load_pem_public_key(
        response.content
    )

PUBLIC_KEY = load_public_key()

class BlockBeeVerifier:

    @staticmethod
    async def verify(request):

        signature_b64 = request.headers.get("x-ca-signature")

        if signature_b64 is None:
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

            return True

        except Exception:
            return False