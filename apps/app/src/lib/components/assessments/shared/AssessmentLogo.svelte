<script lang="ts">
  /**
   * University letterhead logo with a readable fallback.
   *
   * Several templates hotlinked the university's logo from an external site
   * (a Facebook CDN URL with an expiry token, a college site that 503s). When
   * those rot the paper rendered the browser's broken-image box with the raw alt
   * text — "AMET Logo" — which is what people saw instead of a letterhead.
   *
   * Now: if the image is missing or fails to load, we render the university NAME
   * in the letterhead style instead. A paper always has an identity, and dropping
   * the real file into /static later makes it appear with no code change.
   */
  let {
    src = "",
    name = "",
    class: className = "",
    fallbackClass = "",
  } = $props();

  let failed = $state(false);
</script>

{#if src && !failed}
  <img
    {src}
    alt={name}
    class={className}
    onerror={() => (failed = true)}
  />
{:else if name}
  <span
    class="inline-block font-black tracking-tight leading-tight text-[#1F3864] dark:text-[#1F3864] {fallbackClass ||
      'text-[13pt]'}">{name}</span
  >
{/if}
