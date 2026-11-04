<script lang="ts">
  import C3Body from '@cloudy/c3-data/ui/C3Body.svelte';
  let { data } = $props();
</script>

<C3Body {data} />
