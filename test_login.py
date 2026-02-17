import requests
import json

# Test login endpoint
url = "http://localhost:8000/api/v1/auth/login"
payload = {
    "email": "admin@gym-erp.com",
    "password": "password123"
}

print(f"Testing login at: {url}")
print(f"Payload: {json.dumps(payload, indent=2)}")

try:
    response = requests.post(url, json=payload)
    print(f"\nStatus Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    if response.status_code == 200:
        print("\n✓ Login SUCCESS!")
        token = response.json()['data']['access_token']
        print(f"Token: {token[:50]}...")
        
        # Test /me endpoint
        print("\nTesting /me endpoint...")
        me_response = requests.get(
            "http://localhost:8000/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        print(f"Status: {me_response.status_code}")
        print(f"User Data: {json.dumps(me_response.json(), indent=2)}")
    else:
        print("\n✗ Login FAILED!")
        
except requests.exceptions.ConnectionError:
    print("\n✗ Connection Error - Backend is not reachable!")
except Exception as e:
    print(f"\n✗ Error: {e}")
