var sid = new URLSearchParams(location.search).get('session_id');
if (sid) document.getElementById('ref').textContent = 'Référence : ' + sid;
