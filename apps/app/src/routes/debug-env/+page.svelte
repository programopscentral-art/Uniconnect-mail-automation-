<script lang="ts">
    export let data;
</script>

<div style="padding: 2rem; font-family: monospace;">
    <h1>OAuth Debug Info</h1>
    <pre>{JSON.stringify(data, null, 2)}</pre>
    
    <hr />
    
    <h2>Instructions</h2>
    <p>Ensure <b>GOOGLE_GMAIL_REDIRECT_URI</b> matches EXACTLY what you have in Google Console.</p>
    <p>Current: <code>{data.GOOGLE_GMAIL_REDIRECT_URI}</code></p>
</div>
