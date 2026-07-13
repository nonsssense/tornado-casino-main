import hmac
import hashlib
import secrets


class ProvablyFair:

    # Return a random server seed (32 bytes)
    @staticmethod
    def generateServerSeed() -> str:
        return secrets.token_hex(32) 

    # return a random client seed (16 bytes)
    @staticmethod
    def generateClientSeed() -> str:
        return secrets.token_hex(16)

    # return a hash of the server seed (sha256)
    @staticmethod
    def getServerSeedHash(server_seed: str) -> str:
        return hashlib.sha256(
            server_seed.encode()
        ).hexdigest()

    # return a hmac(scheme) of the server seed, client seed and nonce
    @staticmethod
    def getHmac(
        server_seed: str,
        client_seed: str,
        nonce: int
    ) -> bytes:

        message = f"{client_seed}:{nonce}"

        return hmac.new(
            server_seed.encode(),
            message.encode(),
            hashlib.sha256
        ).digest()

    @staticmethod
    def getBits(
        server_seed: str,
        client_seed: str,
        nonce: int,
        amount: int
    ) -> list[int]:

        digest = ProvablyFair.get_hmac(
            server_seed,
            client_seed,
            nonce
        )

        bits = []

        for byte in digest:

            for i in range(8):

                bit = (byte >> i) & 1

                bits.append(bit)

                if len(bits) == amount:
                    return bits

        return bits
    
