import os, requests

apikey = os.environ["API_BLOCKBEE"]
res = requests.get("https://api.blockbee.io/ltc/create/", params={
    "callback": "https://example.com/placeholder",
    "apikey": apikey,
})
print(res.json())