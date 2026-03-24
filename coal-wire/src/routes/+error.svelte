<script lang="ts">
  import { page } from '$app/state';
</script>

<main>
  <h1>{page.status}</h1>
  <p>{page.error?.message ?? 'Something went wrong'}</p>
  <a href="/">Back to search</a>
</main>

<style>
  main {
    max-width: 400px;
    margin: 6rem auto;
    text-align: center;
    padding: 1rem;
  }

  h1 {
    font-size: 3rem;
    margin: 0;
    color: #ccc;
  }

  p {
    color: #888;
    margin: 0.5rem 0 1.5rem;
  }

  a {
    color: #555;
    font-size: 0.85rem;
  }
</style>
