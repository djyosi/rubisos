#!/usr/bin/env python3
"""
WebSocket Server for rubiSOS Real-Time Alerts
"""
import asyncio
import websockets
import json
from datetime import datetime

# Store connected clients
clients = {}
user_locations = {}
alerts = {}

async def handler(websocket, path):
    user_id = None
    try:
        async for message in websocket:
            data = json.loads(message)
            action = data.get('action')
            
            if action == 'register':
                user_id = data.get('userId')
                clients[user_id] = websocket
                user_locations[user_id] = {
                    'location': data.get('location'),
                    'timestamp': datetime.now().isoformat()
                }
                print(f"✅ User registered: {user_id}")
                
                # Send confirmation
                await websocket.send(json.dumps({
                    'type': 'registered',
                    'userId': user_id,
                    'message': 'Connected to rubiSOS network'
                }))
                
            elif action == 'sos':
                sender_id = data.get('userId')
                emergency_type = data.get('emergencyType', 'general')
                location = data.get('location')
                
                # Create alert
                alert_id = f"alert_{datetime.now().timestamp()}"
                alerts[alert_id] = {
                    'id': alert_id,
                    'sender': sender_id,
                    'type': emergency_type,
                    'location': location,
                    'timestamp': datetime.now().isoformat(),
                    'status': 'active',
                    'responses': []
                }
                
                print(f"🚨 SOS from {sender_id}: {emergency_type}")
                
                # Find nearby users (in this demo, just the other test user)
                nearby_users = ['tami' if sender_id == 'yosi' else 'yosi']
                
                # Broadcast to nearby users
                for user in nearby_users:
                    if user in clients:
                        await clients[user].send(json.dumps({
                            'type': 'sos_alert',
                            'alertId': alert_id,
                            'from': sender_id,
                            'emergencyType': emergency_type,
                            'location': location,
                            'timestamp': alerts[alert_id]['timestamp'],
                            'distance': '2.1 km',
                            'eta': '8 min'
                        }))
                        print(f"📤 Alert sent to {user}")
                
                # Confirm to sender
                await websocket.send(json.dumps({
                    'type': 'sos_sent',
                    'alertId': alert_id,
                    'nearbyUsers': len(nearby_users),
                    'message': f'Alert broadcast to {len(nearby_users)} nearby helper(s)'
                }))
                
            elif action == 'respond':
                responder_id = data.get('userId')
                alert_id = data.get('alertId')
                response = data.get('response')  # 'coming' or 'unable'
                
                if alert_id in alerts:
                    alerts[alert_id]['responses'].append({
                        'user': responder_id,
                        'response': response,
                        'timestamp': datetime.now().isoformat()
                    })
                    
                    # Notify sender
                    sender = alerts[alert_id]['sender']
                    if sender in clients:
                        await clients[sender].send(json.dumps({
                            'type': 'response_received',
                            'alertId': alert_id,
                            'from': responder_id,
                            'response': response,
                            'message': f"{responder_id.title()} is {response}!"
                        }))
                        print(f"✅ {responder_id} responded: {response}")
                
            elif action == 'cancel':
                alert_id = data.get('alertId')
                if alert_id in alerts:
                    alerts[alert_id]['status'] = 'cancelled'
                    
                    # Notify responders
                    for response in alerts[alert_id]['responses']:
                        user = response['user']
                        if user in clients:
                            await clients[user].send(json.dumps({
                                'type': 'alert_cancelled',
                                'alertId': alert_id,
                                'message': 'Emergency has been cancelled'
                            }))
                    
                    print(f"❌ Alert {alert_id} cancelled")
                    
    except websockets.exceptions.ConnectionClosed:
        print(f"❌ Connection closed for {user_id}")
    finally:
        if user_id and user_id in clients:
            del clients[user_id]
            print(f"👋 User disconnected: {user_id}")

print("🚀 Starting rubiSOS WebSocket Server...")
print("📡 Listening on ws://localhost:8765")
print("")
print("Features:")
print("  ✅ Real-time SOS alerts")
print("  ✅ User registration")
print("  ✅ Response tracking")
print("  ✅ Alert cancellation")
print("")

start_server = websockets.serve(handler, '0.0.0.0', 8765)
asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()
